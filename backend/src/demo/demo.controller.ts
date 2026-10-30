import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsDefined, ValidateIf, IsISO8601, IsOptional, IsInt, Min } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { replayClock } from '../fixtures/replay-clock';
import { PredictionScoringService } from '../predictions/prediction-scoring.service';
import { DemoGuard } from './demo.guard';
import { DemoService } from './demo.service';

class SetDemoClockDto {
  @ValidateIf((_object, value) => value !== null) @IsDefined() @IsISO8601({ strict: true })
  replayAt!: string | null;
}
class ProcessDemoDto {
  @IsOptional() @IsInt() @Min(1)
  fixture?: number;
}

@Controller('demo') @UseGuards(DemoGuard)
export class DemoController {
  constructor(private readonly demo: DemoService, private readonly db: PrismaService, private readonly scoring: PredictionScoringService) {}
  @Get() state() { return { clock: replayClock() }; }
  @Get('fixtures') async fixtures() {
    const fixtures = await this.db.client.fixture.findMany({ where: { season: { year: 2024, league: { apiId: 39 } }, kickoffAt: { not: null },
      status: { notIn: ['CANC', 'PST', 'ABD', 'AWD', 'WO'] } }, orderBy: { kickoffAt: 'asc' },
      select: { apiId: true, kickoffAt: true, homeTeam: { select: { name: true, apiId: true } }, awayTeam: { select: { name: true, apiId: true } } } });
    return { fixtures };
  }
  @Put() async set(@Body() body: SetDemoClockDto) {
    if (body.replayAt !== null && (!/(Z|[+-]\d{2}:\d{2})$/.test(body.replayAt)
      || Date.parse(body.replayAt) < Date.parse('2024-08-01T00:00:00+07:00') || Date.parse(body.replayAt) > Date.parse('2025-06-30T23:59:59+07:00'))) {
      throw new BadRequestException('เลือกเวลาในฤดูกาล 2024/25 พร้อมเขตเวลา');
    }
    return this.demo.set(body.replayAt);
  }
  @Post('process') async process(@Body() body: ProcessDemoDto) {
    await this.scoring.processDueJob(body.fixture);
    return { clock: replayClock(), message: 'ตรวจงานที่ถึงเวลาแล้วหนึ่งแมตช์ งานอื่นตรวจต่อทุกนาที' };
  }
}
