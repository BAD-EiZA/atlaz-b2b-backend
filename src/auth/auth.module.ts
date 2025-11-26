import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: "atlazlms",
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],        // <-- WAJIB: daftarkan controller
  providers: [AuthService, JwtStrategy], // <-- service untuk handle login
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
