import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}

  private hash(p?: string) {
    if (!p) return undefined;
    // ganti ke bcrypt di produksi. sementara sha256 untuk contoh.
    return crypto.createHash('sha256').update(p).digest('hex');
  }

  async create(dto: CreateUserDto) {
    const exists = await this.db.users.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email ?? '' }],
        deleted_at: null,
      },
      select: { id: true },
    });
    if (exists)
      throw new BadRequestException({
        code: 'USER_EXISTS',
        message: 'Username/email sudah dipakai',
      });

    const user = await this.db.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email,
        password: this.hash(dto.password),
        phone: dto.phone,
        referral_code: `ref-${Date.now()}`,
        role_id: 0,
        status: true,
      },
    });

    await this.db.b2b_org_members.create({
      data: {
        b2b_org_id: dto.orgId,
        user_id: user.id,
        role: (dto.role as any) || 'User',
        status: true,
      },
    });

    return user;
  }

  async update(userId: number, body: UpdateUserDto) {
    const u = await this.db.users.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!u)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User tidak ditemukan',
      });

    return this.db.users.update({
      where: { id: userId },
      data: {
        name: body.name ?? undefined,
        email: body.email ?? undefined,
        phone: body.phone ?? undefined,
        status: body.status ?? undefined,
      },
    });
  }

  async updateProfile(userId: number, body: UpdateProfileDto) {
    const u = await this.db.users.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!u)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User tidak ditemukan',
      });

    const prof = await this.db.user_profiles.findFirst({
      where: { user_id: userId, deleted_at: null },
    });
    if (prof) {
      await this.db.user_profiles.update({
        where: { id: prof.id },
        data: {
          nationality: body.nationality ?? prof.nationality,
          country_origin: body.country_origin ?? prof.country_origin,
          first_language: body.first_language ?? prof.first_language,
        },
      });
    } else {
      await this.db.user_profiles.create({
        data: {
          user_id: userId,
          nationality: body.nationality ?? '',
          country_origin: body.country_origin ?? '',
          first_language: body.first_language ?? '',
        },
      });
    }
    return { ok: true };
  }
}
