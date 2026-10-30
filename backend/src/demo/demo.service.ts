import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { replayClock, setReplayOverride } from '../fixtures/replay-clock';
import { PredictionScoringService } from '../predictions/prediction-scoring.service';

@Injectable()
export class DemoService {
  constructor(private readonly db: PrismaService, private readonly scoring: PredictionScoringService) {}
  async set(replayAt: string | null) {
    const row = await this.db.client.replaySetting.upsert({ where: { id: 1 },
      create: { id: 1, replayAt: replayAt ? new Date(replayAt) : null }, update: { replayAt: replayAt ? new Date(replayAt) : null } });
    setReplayOverride(row.replayAt, row.updatedAt.getTime());
    await this.scoring.rescheduleForClock();
    return { clock: replayClock() };
  }
}
