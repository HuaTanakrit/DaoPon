import { Module } from '@nestjs/common';
import { PredictionsModule } from '../predictions/predictions.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoGuard } from './demo.guard';
import { JobsModule } from '../jobs/jobs.module';

@Module({ imports: [PredictionsModule, JobsModule], controllers: [DemoController], providers: [DemoService, DemoGuard] })
export class DemoModule {}
