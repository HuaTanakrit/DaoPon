import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SeasonQueryDto } from '../common/dto/season.dto';

export class UpcomingFixturesQueryDto extends SeasonQueryDto {
  @ApiPropertyOptional({ description: 'API-Football team ID, e.g. Liverpool = 40' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  team?: number;
}

export class FixturesQueryDto extends UpcomingFixturesQueryDto {
  @ApiPropertyOptional({ example: 'FT' })
  @IsOptional() @IsString() @MaxLength(16) @Matches(/^[A-Z0-9]+$/)
  status?: string;
}
