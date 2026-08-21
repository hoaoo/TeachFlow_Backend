import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Returns today's YYYY-MM-DD string and UTC Date bounds in Asia/Ho_Chi_Minh timezone.
 */
export function getTodayVNRange(): {
  todayStr: string;
  startOfDayUTC: Date;
  endOfDayUTC: Date;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(new Date()); // e.g. "2026-08-22"
  const startOfDayUTC = new Date(`${todayStr}T00:00:00.000+07:00`);
  const endOfDayUTC = new Date(`${todayStr}T23:59:59.999+07:00`);
  return { todayStr, startOfDayUTC, endOfDayUTC };
}

@Injectable()
export class TasksCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Run an initial cleanup on startup
    this.cleanupExpiredTasks().catch((err) =>
      this.logger.error(`Initial task cleanup error: ${err.message}`),
    );

    // Schedule next daily run at 00:00:05 in Asia/Ho_Chi_Minh
    this.scheduleNextMidnightRun();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedule the next execution at 00:00:05 VN time
   */
  private scheduleNextMidnightRun() {
    const { startOfDayUTC } = getTodayVNRange();
    // Next midnight in VN is startOfDayUTC + 24 hours + 5 seconds buffer
    const nextMidnightTime = startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 + 5000;
    const now = Date.now();
    const delay = Math.max(1000, nextMidnightTime - now);

    this.logger.log(
      `Next 00:00 Task Cleanup scheduled in ${Math.round(delay / 1000)}s (at ${new Date(nextMidnightTime).toISOString()})`,
    );

    this.timer = setTimeout(async () => {
      try {
        await this.cleanupExpiredTasks();
      } catch (err: any) {
        this.logger.error(`Scheduled task cleanup error: ${err?.message}`);
      } finally {
        this.scheduleNextMidnightRun();
      }
    }, delay);
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Delete tasks from previous days
   */
  async cleanupExpiredTasks(): Promise<number> {
    const { todayStr, startOfDayUTC } = getTodayVNRange();

    const result = await this.prisma.teacherTask.deleteMany({
      where: {
        OR: [
          { taskDate: { lt: todayStr } },
          {
            AND: [
              { createdAt: { lt: startOfDayUTC } },
              { OR: [{ taskDate: null }, { taskDate: { lt: todayStr } }] },
            ],
          },
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `[TaskCleanup] Purged ${result.count} expired task(s) older than ${todayStr} (Asia/Ho_Chi_Minh).`,
      );
    }
    return result.count;
  }
}
