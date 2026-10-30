import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';

@Global()
@Module({ controllers: [AuthController], providers: [AuthService, AuthGuard], exports: [AuthService, AuthGuard] })
export class AuthModule {}
