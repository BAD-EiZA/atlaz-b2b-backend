import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const orgId = Number(req.params.orgId ?? req.query.orgId);
    if (!user || !orgId) return false;

    const member = await this.db.b2b_org_members.findFirst({
      where: {
        b2b_org_id: orgId,
        user_id: user.userId,
        status: true,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!member)
      throw new ForbiddenException({
        code: 'NOT_ORG_MEMBER',
        message: 'Bukan anggota organisasi',
      });
    return true;
  }
}
