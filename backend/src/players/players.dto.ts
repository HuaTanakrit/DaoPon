import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SeasonQueryDto } from '../common/dto/season.dto';

export class PlayersQueryDto extends SeasonQueryDto {
  @ApiPropertyOptional({ description: 'API-Football team ID' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  team?: number;

  @ApiPropertyOptional({ description: 'Search player name' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  search?: string;
}

export class LeaderboardQueryDto extends SeasonQueryDto {
  @ApiPropertyOptional({ enum: ['goals', 'assists'], default: 'goals' })
  @IsOptional() @IsIn(['goals', 'assists'])
  metric: 'goals' | 'assists' = 'goals';
}
