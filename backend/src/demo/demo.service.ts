import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { replayClock, setReplayOverride } from '../fixtures/replay-clock';
import { PredictionScoringService } from '../predictions/prediction-scoring.service';

@Injectable()
export class DemoService implements OnModuleInit {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService, private readonly scoring: PredictionScoringService) {}
  async onModuleInit() {
    setReplayOverride(null, 0);
    if (!this.db.configured || this.config.get<boolean>('DEMO_CONTROLS_ENABLED') !== true) return;
    const saved = await this.db.client.replaySetting.findUnique({ where: { id: 1 } });
    if (saved) setReplayOverride(saved.replayAt, saved.updatedAt.getTime());
  }
  async set(replayAt: string | null) {
    const row = await this.db.client.replaySetting.upsert({ where: { id: 1 },
      create: { id: 1, replayAt: replayAt ? new Date(replayAt) : null }, update: { replayAt: replayAt ? new Date(replayAt) : null } });
    setReplayOverride(row.replayAt, row.updatedAt.getTime());
    await this.scoring.rescheduleForClock();
    return { clock: replayClock() };
  }
}
