import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrgAdminGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    console.log(req,"RE")
    const user = req.user;
    const orgId = Number(req.params.orgId ?? req.query.orgId);
    if (!user || !orgId) return false;

    const member = await this.db.b2b_org_members.findFirst({
      where: {
        b2b_org_id: orgId,
        user_id: user.id, // ✅
        role: 'Admin',
        status: true,
        deleted_at: null,
      },
    });
    if (!member)
      throw new ForbiddenException({
        code: 'NOT_ORG_ADMIN',
        message: 'Hak admin diperlukan',
      });
    return true;
  }
}
