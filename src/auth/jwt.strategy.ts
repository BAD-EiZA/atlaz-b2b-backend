import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      secretOrKey: "atlazlms",
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    console.log(payload,"PAY")
    // payload minimal: { sub: userId, email, name, role_id, ... }
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role_id: payload.role_id,
    };
  }
}
