import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { PaginatedResultDto } from '../dto/paginated-result.dto';

export interface AuditLogInput {
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: 'SUCCESS' | 'FAILURE' | string;
  ipAddress?: string;
  details?: string | Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remove any sensitive keys from data before writing to database or logs
   */
  private sanitizeData(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      // Mask if looks like JWT or sensitive string
      if (obj.length > 50 && obj.split('.').length === 3) return '[REDACTED_JWT]';
      return obj;
    }
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeData(item));
    }

    const sanitized: Record<string, any> = {};
    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'password_hash',
      'refreshtoken',
      'refreshtokenhash',
      'refresh_token',
      'token',
      'secret',
      'jwt',
      'authorization',
      'cookie',
      'database_url',
      'apikey',
      'api_key',
    ]);

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeData(value);
      }
    }

    return sanitized;
  }

  /**
   * Asynchronously and safely logs an audit record.
   * Will never throw an error to disrupt the main caller's transaction/flow.
   */
  async log(entry: AuditLogInput): Promise<void> {
    try {
      let serializedDetails: string | null = null;
      if (entry.details) {
        if (typeof entry.details === 'string') {
          serializedDetails = entry.details;
        } else {
          const cleanObj = this.sanitizeData(entry.details);
          serializedDetails = JSON.stringify(cleanObj);
        }
      }

      const status = entry.status || 'SUCCESS';
      const actorUserId = entry.actorUserId || 'SYSTEM';

      await this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          actorEmail: entry.actorEmail || null,
          action: entry.action,
          targetUserId: entry.targetUserId || null,
          resourceType: entry.resourceType || null,
          resourceId: entry.resourceId || null,
          status,
          ipAddress: entry.ipAddress || null,
          details: serializedDetails,
        },
      });

      this.logger.log(
        `[AUDIT] action=${entry.action} actor=${entry.actorEmail || actorUserId} resource=${entry.resourceType || 'N/A'}:${entry.resourceId || 'N/A'} status=${status}`,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to write audit log for action "${entry.action}": ${err?.message}`);
    }
  }

  /**
   * Query audit logs with pagination and filters (for ADMIN users)
   */
  async listLogs(query: AuditQueryDto): Promise<PaginatedResultDto<any>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(Math.max(1, query.pageSize || 20), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    if (query.actorUserId) {
      where.actorUserId = query.actorUserId;
    }

    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }

    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.keyword && query.keyword.trim()) {
      const kw = query.keyword.trim();
      where.OR = [
        { action: { contains: kw, mode: 'insensitive' } },
        { actorEmail: { contains: kw, mode: 'insensitive' } },
        { details: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return new PaginatedResultDto(items, total, page, pageSize);
  }
}
