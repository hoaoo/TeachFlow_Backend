import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ExportService } from './export.service';
import { TeacherBackupService } from './teacher-backup.service';
import { ExportBackupDto } from './dto/export-backup.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition } from './export.utils';

@ApiTags('Export')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly teacherBackupService: TeacherBackupService,
  ) {}

  @Get('lesson-plans/:id/export/docx')
  @ApiOperation({ summary: 'Xuất giáo án ra file Microsoft Word (.docx)' })
  @ApiResponse({ status: 200, description: 'File Word .docx của giáo án' })
  async exportLessonPlanDocx(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } = await this.exportService.exportLessonPlanDocx(id, user);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('lesson-plans/:id/export/pdf')
  @ApiOperation({ summary: 'Xuất giáo án ra file PDF chuẩn in ấn' })
  @ApiResponse({ status: 200, description: 'File PDF của giáo án' })
  async exportLessonPlanPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, asciiFilename, utf8Filename } = await this.exportService.exportLessonPlanPdf(id, user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('worksheets/:id/export/docx')
  @ApiOperation({ summary: 'Xuất phiếu học tập ra file Microsoft Word (.docx)' })
  @ApiQuery({ name: 'includeAnswers', required: false, type: Boolean, description: 'Bao gồm đáp án và hướng dẫn chấm' })
  @ApiResponse({ status: 200, description: 'File Word .docx của phiếu học tập' })
  async exportWorksheetDocx(
    @Param('id') id: string,
    @Query('includeAnswers') includeAnswers: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const withAnswers = includeAnswers === 'true' || includeAnswers === '1';
    const { buffer, asciiFilename, utf8Filename } = await this.exportService.exportWorksheetDocx(
      id,
      user,
      withAnswers,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('worksheets/:id/export/pdf')
  @ApiOperation({ summary: 'Xuất phiếu học tập ra file PDF' })
  @ApiQuery({ name: 'includeAnswers', required: false, type: Boolean, description: 'Bao gồm đáp án và hướng dẫn chấm' })
  @ApiResponse({ status: 200, description: 'File PDF của phiếu học tập' })
  async exportWorksheetPdf(
    @Param('id') id: string,
    @Query('includeAnswers') includeAnswers: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const withAnswers = includeAnswers === 'true' || includeAnswers === '1';
    const { buffer, asciiFilename, utf8Filename } = await this.exportService.exportWorksheetPdf(
      id,
      user,
      withAnswers,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(asciiFilename, utf8Filename));
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Post('export/backup')
  @ApiOperation({ summary: 'Xuất toàn bộ gói sao lưu dữ liệu của giáo viên (file ZIP)' })
  @ApiResponse({ status: 200, description: 'Tập tin ZIP sao lưu dữ liệu' })
  async exportBackup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExportBackupDto,
    @Res() res: Response,
  ) {
    const { stream, filename, contentType } = await this.teacherBackupService.generateBackupZip(
      user.userId,
      user.teacherId,
      dto,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return stream.pipe(res);
  }
}
