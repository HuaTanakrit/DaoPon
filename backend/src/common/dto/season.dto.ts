import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class SeasonQueryDto extends PaginationDto {
  @ApiPropertyOptional({ default: 2024, description: 'Season start year: 2024 means 2024/25' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  season = 2024;

  @ApiPropertyOptional({ default: 39 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  league = 39;
}
