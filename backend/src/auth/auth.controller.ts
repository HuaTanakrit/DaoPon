import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard, AuthRequest } from './auth.guard';
import { LoginDto, RegisterDto } from './auth.dto';

@ApiTags('accounts')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register')
  register(@Body() body: RegisterDto, @Req() request: Request, @Headers('x-guest-token') guest?: string) {
    return this.auth.register(body, request.ip || 'local', guest);
  }
  @Post('login')
  login(@Body() body: LoginDto, @Req() request: Request, @Headers('x-guest-token') guest?: string) {
    return this.auth.login(body, request.ip || 'local', guest);
  }
  @Get('me') @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest) { return { user: request.user }; }
  @Post('logout')
  logout(@Headers('authorization') header?: string) { return this.auth.logout(header); }
}
