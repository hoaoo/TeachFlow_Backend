import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HtmlGameStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../resources/storage/object-storage.service';
import { CreateHtmlGameDto } from './dto/create-html-game.dto';
import { HtmlGameQueryDto } from './dto/html-game-query.dto';
import { UpdateHtmlGameStatusDto } from './dto/update-html-game-status.dto';
import { UpdateHtmlGameDto } from './dto/update-html-game.dto';
import { HtmlGamePackageService } from './html-game-package.service';

const GAME_INCLUDE = {
  grade: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true } },
} satisfies Prisma.HtmlGameInclude;

@Injectable()
export class HtmlGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    private readonly packageService: HtmlGamePackageService,
  ) {}

  async findAll(query: HtmlGameQueryDto, user: AuthenticatedUser) {
    const where: Prisma.HtmlGameWhereInput = {};
    if (user.role !== 'ADMIN') {
      where.status = HtmlGameStatus.PUBLISHED;
    } else if (query.status) {
      where.status = query.status;
    }
    if (query.gradeId) where.gradeId = query.gradeId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const games = await this.prisma.htmlGame.findMany({
      where,
      include: GAME_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return games.map((game) => this.mapGame(game));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const game = await this.prisma.htmlGame.findUnique({
      where: { id },
      include: GAME_INCLUDE,
    });
    if (!game || (user.role !== 'ADMIN' && game.status !== HtmlGameStatus.PUBLISHED)) {
      throw new NotFoundException('Không tìm thấy trò chơi HTML');
    }
    return this.mapGame(game);
  }

  async getPlay(id: string, user: AuthenticatedUser) {
    const game = await this.prisma.htmlGame.findUnique({ where: { id } });
    if (!game || (user.role !== 'ADMIN' && game.status !== HtmlGameStatus.PUBLISHED)) {
      throw new NotFoundException('Không tìm thấy trò chơi HTML');
    }
    const entryKey = `${game.storagePrefix}/${game.entryFile}`;
    if (!(await this.objectStorage.objectExists(entryKey))) {
      throw new NotFoundException('Trò chơi chưa có gói HTML hợp lệ');
    }
    return {
      id: game.id,
      title: game.title,
      playUrl: this.objectStorage.getPublicUrl(entryKey),
      sandbox: 'allow-scripts allow-forms',
      referrerPolicy: 'no-referrer',
    };
  }

  async create(dto: CreateHtmlGameDto, actor: AuthenticatedUser) {
    await this.validateReferences(dto.gradeId, dto.subjectId);
    const id = randomUUID();
    const game = await this.prisma.htmlGame.create({
      data: {
        id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        thumbnail: dto.thumbnail
          ? (dto.thumbnail as unknown as Prisma.InputJsonValue)
          : undefined,
        gradeId: dto.gradeId || null,
        subjectId: dto.subjectId || null,
        storagePrefix: `games/${id}/package-initial`,
        entryFile: 'index.html',
        status: HtmlGameStatus.DRAFT,
        createdById: actor.userId,
      },
      include: GAME_INCLUDE,
    });
    return this.mapGame(game);
  }

  async update(id: string, dto: UpdateHtmlGameDto) {
    await this.requireGame(id);
    await this.validateReferences(dto.gradeId, dto.subjectId);
    const data: Prisma.HtmlGameUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.thumbnail !== undefined) {
      data.thumbnail = dto.thumbnail === null
        ? Prisma.DbNull
        : (dto.thumbnail as unknown as Prisma.InputJsonValue);
    }
    if (dto.gradeId !== undefined) {
      data.grade = dto.gradeId ? { connect: { id: dto.gradeId } } : { disconnect: true };
    }
    if (dto.subjectId !== undefined) {
      data.subject = dto.subjectId
        ? { connect: { id: dto.subjectId } }
        : { disconnect: true };
    }
    const game = await this.prisma.htmlGame.update({
      where: { id },
      data,
      include: GAME_INCLUDE,
    });
    return this.mapGame(game);
  }

  async updateStatus(id: string, dto: UpdateHtmlGameStatusDto) {
    const existing = await this.requireGame(id);
    const entryKey = `${existing.storagePrefix}/${existing.entryFile}`;
    if (
      dto.status === HtmlGameStatus.PUBLISHED &&
      !(await this.objectStorage.objectExists(entryKey))
    ) {
      throw new BadRequestException('Phải tải gói có index.html trước khi xuất bản');
    }
    const game = await this.prisma.htmlGame.update({
      where: { id },
      data: { status: dto.status },
      include: GAME_INCLUDE,
    });
    return this.mapGame(game);
  }

  async uploadPackage(id: string, file: Express.Multer.File) {
    const game = await this.requireGame(id);
    const parsed = await this.packageService.parse(file);
    const nextStoragePrefix = `games/${id}/package-${randomUUID()}`;
    try {
      for (const item of parsed.files) {
        await this.objectStorage.putObject({
          key: `${nextStoragePrefix}/${item.relativePath}`,
          body: item.body,
          contentType: item.contentType,
        });
      }
    } catch (error) {
      await this.objectStorage.deletePrefix(nextStoragePrefix).catch(() => undefined);
      throw error;
    }

    const swapped = await this.prisma.htmlGame.updateMany({
      where: { id, storagePrefix: game.storagePrefix },
      data: { storagePrefix: nextStoragePrefix, entryFile: 'index.html' },
    });
    if (swapped.count !== 1) {
      await this.objectStorage.deletePrefix(nextStoragePrefix).catch(() => undefined);
      throw new ConflictException('Gói trò chơi vừa được cập nhật ở một phiên khác');
    }

    const updated = await this.prisma.htmlGame.findUnique({
      where: { id },
      include: GAME_INCLUDE,
    });
    await this.objectStorage.deletePrefix(game.storagePrefix).catch(() => undefined);
    return {
      ...this.mapGame(updated),
      package: { fileCount: parsed.files.length, totalSize: parsed.totalSize },
    };
  }

  async remove(id: string) {
    await this.requireGame(id);
    await this.objectStorage.deletePrefix(`games/${id}`);
    await this.prisma.htmlGame.delete({ where: { id } });
    return { success: true, message: 'Đã xóa trò chơi HTML' };
  }

  private async requireGame(id: string) {
    const game = await this.prisma.htmlGame.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Không tìm thấy trò chơi HTML');
    return game;
  }

  private async validateReferences(gradeId?: string | null, subjectId?: string | null) {
    const [grade, subject] = await Promise.all([
      gradeId ? this.prisma.grade.findUnique({ where: { id: gradeId } }) : null,
      subjectId ? this.prisma.subject.findUnique({ where: { id: subjectId } }) : null,
    ]);
    if (gradeId && !grade) throw new BadRequestException('Khối lớp không tồn tại');
    if (subjectId && !subject) throw new BadRequestException('Môn học không tồn tại');
  }

  private mapGame(game: any) {
    return {
      id: game.id,
      title: game.title,
      description: game.description,
      thumbnail: game.thumbnail,
      gradeId: game.gradeId,
      grade: game.grade || null,
      subjectId: game.subjectId,
      subject: game.subject || null,
      entryFile: game.entryFile,
      status: game.status,
      createdBy: game.createdBy || null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    };
  }
}
