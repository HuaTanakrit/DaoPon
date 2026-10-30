import { Module } from '@nestjs/common';
import { PredictionsModule } from '../predictions/predictions.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoGuard } from './demo.guard';

@Module({ imports: [PredictionsModule], controllers: [DemoController], providers: [DemoService, DemoGuard] })
export class DemoModule {}
