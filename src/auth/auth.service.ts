import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login({ username, password }: { username: string; password: string }) {
    // TODO: ganti dengan cek DB yang sebenarnya
    if (!username || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = { sub: 1, username }; // contoh payload
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, tokenType: 'Bearer' };
  }
}
