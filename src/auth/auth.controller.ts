import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@Controller('auth') // -> /v1/auth
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') // -> /v1/auth/login
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
