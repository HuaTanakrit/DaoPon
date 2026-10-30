import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';

export class PredictionTeamDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  team?: number;
}

export class SavePredictionDto {
  @Type(() => Number) @IsInt() @Min(1)
  team!: number;

  @IsIn(['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'])
  formation!: string;

  @IsArray() @ArrayMinSize(11) @ArrayMaxSize(11) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  playerApiIds!: number[];
}

export class SaveScorePredictionDto {
  @IsInt() @Min(1)
  team!: number;

  @IsInt() @Min(0) @Max(99)
  homeGoals!: number;

  @IsInt() @Min(0) @Max(99)
  awayGoals!: number;
}
