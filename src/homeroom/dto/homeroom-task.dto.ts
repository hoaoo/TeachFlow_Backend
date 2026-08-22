import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHomeroomTaskDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional() @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  note?: string;
}

export class UpdateHomeroomTaskDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional() @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional() @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  note?: string;
}
