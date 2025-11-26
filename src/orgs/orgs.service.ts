import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateOrgDto } from './dto/update-org.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrgsService {
  constructor(private readonly db: PrismaService) {}

  async get(orgId: number) {
    const org = await this.db.b2b_orgs.findFirst({
      where: { id: orgId, deleted_at: null },
    });
    if (!org)
      throw new NotFoundException({
        code: 'ORG_NOT_FOUND',
        message: 'Organisasi tidak ditemukan',
      });
    return org;
  }

  async update(orgId: number, dto: UpdateOrgDto) {
    await this.get(orgId);
    const org = await this.db.b2b_orgs.update({
      where: { id: orgId },
      data: {
        name: dto.name ?? undefined,
        logo: dto.logo ?? undefined,
        updated_at: new Date(),
      },
    });
    return org;
  }
}
