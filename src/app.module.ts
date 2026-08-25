import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeachersModule } from './teachers/teachers.module';
import { SchoolYearsModule } from './school-years/school-years.module';
import { GradesModule } from './grades/grades.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ClassroomsModule } from './classrooms/classrooms.module';
import { StudentsModule } from './students/students.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LessonPlansModule } from './lesson-plans/lesson-plans.module';
import { ActivityLibraryModule } from './activity-library/activity-library.module';
import { TeachingPlansModule } from './teaching-plans/teaching-plans.module';
import { WorksheetsModule } from './worksheets/worksheets.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { StudentCommentsModule } from './student-comments/student-comments.module';
import { ResourcesModule } from './resources/resources.module';
import { TasksModule } from './tasks/tasks.module';
import { AiModule } from './ai/ai.module';
import { ExportModule } from './export/export.module';
import { AdminModule } from './admin/admin.module';
import { HomeroomModule } from './homeroom/homeroom.module';
import { SemestersModule } from './semesters/semesters.module';
import { StudentEnrollmentsModule } from './student-enrollments/student-enrollments.module';
import { TeachingAssignmentsModule } from './teaching-assignments/teaching-assignments.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulesModule } from './schedules/schedules.module';
import { HealthModule } from './health/health.module';
import { SeatingPlansModule } from './seating-plans/seating-plans.module';
import { TemplatesModule } from './templates/templates.module';
import { SearchModule } from './search/search.module';
import { CommonModule } from './common/common.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),
    PrismaModule,
    CommonModule,
    HealthModule,
    SeatingPlansModule,
    TemplatesModule,
    AuthModule,
    UsersModule,
    TeachersModule,
    SchoolYearsModule,
    SemestersModule,
    GradesModule,
    SubjectsModule,
    ClassroomsModule,
    StudentsModule,
    DashboardModule,
    LessonPlansModule,
    ActivityLibraryModule,
    TeachingPlansModule,
    WorksheetsModule,
    AttendanceModule,
    AssessmentsModule,
    StudentCommentsModule,
    ResourcesModule,
    TasksModule,
    AiModule,
    ExportModule,
    AdminModule,
    HomeroomModule,
    StudentEnrollmentsModule,
    TeachingAssignmentsModule,
    ReportsModule,
    NotificationsModule,
    SchedulesModule,
    SearchModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
