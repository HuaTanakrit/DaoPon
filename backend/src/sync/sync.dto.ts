import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncSeasonDto {
  @ApiPropertyOptional({ default: 2024 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  season = 2024;
}

export class SyncPlayersDto extends SyncSeasonDto {
  @ApiProperty({ example: 40, description: 'API-Football team ID' })
  @Type(() => Number) @IsInt() @Min(1)
  team!: number;
}
