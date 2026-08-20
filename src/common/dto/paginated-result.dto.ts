import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResultDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;

  constructor(items: T[], totalItems: number, page: number, pageSize: number) {
    this.items = items;
    this.totalItems = totalItems;
    this.page = page;
    this.pageSize = pageSize;
    this.totalPages = Math.ceil(totalItems / pageSize) || 1;
  }
}
