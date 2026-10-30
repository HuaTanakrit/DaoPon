import { Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { JobsGuard } from './jobs.guard';
import { JobsService } from './jobs.service';

@Controller('jobs') @UseGuards(JobsGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}
  @Get('tick') @Header('Cache-Control', 'no-store')
  tick() { return this.jobs.run(); }
  @Post('tick') @Header('Cache-Control', 'no-store')
  postTick() { return this.jobs.run(); }
}
