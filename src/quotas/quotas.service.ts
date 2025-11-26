import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AllocateQuotaDto } from './dto/allocate-quota.dto';
import { RevokeQuotaDto } from './dto/revoke-quota.dto';
import { TestKind } from './dto/test-kind.enum';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuotasService {
  constructor(private readonly db: PrismaService) {}

  private async ensureTestTypeExists(test: TestKind, test_type_id: number) {
    if (test === TestKind.IELTS) {
      const t = await this.db.ielts_m_type.findFirst({
        where: { id: test_type_id, deleted_at: null },
      });
      if (!t)
        throw new BadRequestException({
          code: 'UNKNOWN_TEST_TYPE',
          message: 'IELTS test_type_id tidak dikenal',
        });
    } else {
      // Jika ada master toefl type, validasi di sini
    }
  }

  private async getOrgRemaining(
    tx: any,
    orgId: number,
    test: TestKind,
    test_type_id: number,
  ) {
    const now = new Date();
    if (test === TestKind.IELTS) {
      const top = await tx.b2b_org_ielts_quotas.aggregate({
        _sum: { total_quota: true },
        where: {
          b2b_org_id: orgId,
          test_type_id,
          status: true,
          deleted_at: null,
        },
      });
      const used = await tx.b2b_org_log_ielts_quotas.aggregate({
        _sum: { user_quota: true },
        where: { b2b_org_id: orgId, test_type_id, deleted_at: null },
      });
      return Number(top._sum.total_quota ?? 0);
    }
    const top = await tx.b2b_org_toefl_quotas.aggregate({
      _sum: { total_quota: true },
      where: {
        b2b_org_id: orgId,
        test_type_id,
        status: true,
        deleted_at: null,
      },
    });
    const used = await tx.b2b_org_log_toefl_quotas.aggregate({
      _sum: { user_quota: true },
      where: { b2b_org_id: orgId, test_type_id, deleted_at: null },
    });
    return Number(top._sum.total_quota ?? 0);
  }

  async allocate(orgId: number, dto: AllocateQuotaDto) {
    // await this.ensureTestTypeExists(dto.test, dto.test_type_id);

    return this.db.$transaction(
      async (tx) => {
        const remainingBefore = await this.getOrgRemaining(
          tx,
          orgId,
          dto.test,
          dto.test_type_id,
        );
        if (remainingBefore < dto.amount) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_ORG_QUOTA',
            message: `Sisa kuota org tidak cukup (tersisa ${remainingBefore}, butuh ${dto.amount})`,
          });
        }

        if (dto.test === TestKind.IELTS) {
          const existing = await tx.ielts_user_quota.findFirst({
            where: {
              user_id: dto.user_id,
              package_type: dto.test_type_id,
              deleted_at: null,
            },
          });
          if (existing) {
            await tx.ielts_user_quota.update({
              where: { id: existing.id },
              data: { quota: Number(existing.quota ?? 0) + dto.amount },
            });
          } else {
            await tx.ielts_user_quota.create({
              data: {
                user_id: dto.user_id,
                package_type: dto.test_type_id,
                quota: dto.amount,
                currency: 'IDR',
              },
            });
          }
          await Promise.all([
            tx.b2b_org_log_ielts_quotas.create({
              data: {
                b2b_org_id: orgId,
                admin_id: dto.admin_id,
                user_id: dto.user_id,
                test_type_id: dto.test_type_id,
                user_quota: dto.amount,
                org_quota_left: remainingBefore - dto.amount,
              },
            }),
            tx.b2b_org_ielts_quotas.updateMany({
              where: {
                b2b_org_id: orgId,
                test_type_id: dto.test_type_id,
              },
              data: {
                total_quota: { decrement: dto.amount },
              },
            }),
          ]);
        } else {
          const existing = await tx.toefl_user_quota.findFirst({
            where: {
              user_id: dto.user_id,
              package_type: dto.test_type_id,
              deleted_at: null,
            },
          });

          if (existing) {
            await tx.toefl_user_quota.update({
              where: { id: existing.id },
              data: { quota: Number(existing.quota ?? 0) + dto.amount },
            });
          } else {
            await tx.toefl_user_quota.create({
              data: {
                user_id: dto.user_id,
                package_type: dto.test_type_id,
                quota: dto.amount,
                currency: 'IDR',
              },
            });
          }
          await Promise.all([
            tx.b2b_org_toefl_quotas.updateMany({
              where: {
                b2b_org_id: orgId,
                test_type_id: dto.test_type_id,
              },
              data: {
                total_quota: { decrement: dto.amount },
              },
            }),
            tx.b2b_org_log_toefl_quotas.create({
              data: {
                b2b_org_id: orgId,
                admin_id: dto.admin_id,
                user_id: dto.user_id,
                test_type_id: dto.test_type_id,
                user_quota: dto.amount,
                org_quota_left: remainingBefore - dto.amount,
              },
            }),
          ]);
        }

        const remainingAfter = await this.getOrgRemaining(
          tx,
          orgId,
          dto.test,
          dto.test_type_id,
        );
        return {
          ok: true,
          test: dto.test,
          orgId,
          test_type_id: dto.test_type_id,
          before: remainingBefore,
          change: -dto.amount,
          after: remainingAfter,
        };
      },
      { isolationLevel: 'Serializable' as any },
    );
  }

  async revoke(orgId: number, dto: RevokeQuotaDto) {
    await this.ensureTestTypeExists(dto.test, dto.test_type_id);

    return this.db.$transaction(
      async (tx) => {
        let userQuota = 0;
        if (dto.test === TestKind.IELTS) {
          const u = await tx.ielts_user_quota.findFirst({
            where: {
              user_id: dto.user_id,
              package_type: dto.test_type_id,
              deleted_at: null,
            },
          });
          userQuota = Number(u?.quota ?? 0);
          if (userQuota < dto.amount)
            throw new BadRequestException({
              code: 'INSUFFICIENT_USER_QUOTA',
              message: `Kuota user kurang (${userQuota} < ${dto.amount})`,
            });
          const before = await this.getOrgRemaining(
            tx,
            orgId,
            dto.test,
            dto.test_type_id,
          );

          await Promise.all([
            tx.b2b_org_ielts_quotas.updateMany({
              where: {
                b2b_org_id: orgId,
                test_type_id: dto.test_type_id,
              },
              data: {
                total_quota: { increment: dto.amount },
              },
            }),
            tx.ielts_user_quota.update({
              where: { id: u!.id },
              data: { quota: userQuota - dto.amount },
            }),
            tx.b2b_org_log_ielts_quotas.create({
              data: {
                b2b_org_id: orgId,
                admin_id: dto.admin_id,
                user_id: dto.user_id,
                test_type_id: dto.test_type_id,
                user_quota: -dto.amount,
                org_quota_left: before + dto.amount,
              },
            }),
          ]);
        } else {
          const u = await tx.toefl_user_quota.findFirst({
            where: {
              user_id: dto.user_id,
              package_type: dto.test_type_id,
              deleted_at: null,
            },
          });
          userQuota = Number(u?.quota ?? 0);
          if (userQuota < dto.amount)
            throw new BadRequestException({
              code: 'INSUFFICIENT_USER_QUOTA',
              message: `Kuota user kurang (${userQuota} < ${dto.amount})`,
            });
          const before = await this.getOrgRemaining(
            tx,
            orgId,
            dto.test,
            dto.test_type_id,
          );

          await Promise.all([
            tx.b2b_org_toefl_quotas.updateMany({
              where: {
                b2b_org_id: orgId,
                test_type_id: dto.test_type_id,
              },
              data: {
                total_quota: { increment: dto.amount },
              },
            }),
            tx.toefl_user_quota.update({
              where: { id: u!.id },
              data: { quota: userQuota - dto.amount },
            }),
            tx.b2b_org_log_toefl_quotas.create({
              data: {
                b2b_org_id: orgId,
                admin_id: dto.admin_id,
                user_id: dto.user_id,
                test_type_id: dto.test_type_id,
                user_quota: -dto.amount,
                org_quota_left: before + dto.amount,
              },
            }),
          ]);
        }

        const after = await this.getOrgRemaining(
          tx,
          orgId,
          dto.test,
          dto.test_type_id,
        );
        return {
          ok: true,
          test: dto.test,
          orgId,
          test_type_id: dto.test_type_id,
          change: +dto.amount,
          after,
        };
      },
      { isolationLevel: 'Serializable' as any },
    );
  }

  async summary(orgId: number) {
    const now = new Date();

    // ---- IELTS TYPES (untuk label nama test type) ----
    const iTypeRows = await this.db.ielts_m_type.findMany({
      where: { deleted_at: null },
      select: { id: true, type: true },
    });
    const iTypeName: Record<number, string> = {};
    for (const t of iTypeRows) {
      iTypeName[t.id] = t.type ?? `Type ${t.id}`;
    }

    // ---- IELTS: TOPUP & USED ----
    const iTop = await this.db.b2b_org_ielts_quotas.groupBy({
      by: ['test_type_id'],
      where: {
        b2b_org_id: orgId,
        status: true,
        deleted_at: null,
      },
      _sum: { total_quota: true },
    });
    const iUse = await this.db.b2b_org_log_ielts_quotas.groupBy({
      by: ['test_type_id'],
      where: { b2b_org_id: orgId, deleted_at: null },
      _sum: { user_quota: true },
    });

    const iMap: Record<
      number,
      { topup: number; used: number; remaining: number }
    > = {};
    for (const r of iTop) {
      iMap[r.test_type_id] = {
        topup: Number(r._sum.total_quota ?? 0),
        used: 0,
        remaining: Number(r._sum.total_quota ?? 0),
      };
    }
    for (const r of iUse) {
      const k = r.test_type_id;
      if (!iMap[k]) iMap[k] = { topup: 0, used: 0, remaining: 0 };
      iMap[k].used += Number(r._sum.user_quota ?? 0);
    }

    let iTopSum = 0,
      iUseSum = 0,
      iRemSum = 0;
    for (const k of Object.keys(iMap)) {
      const key = Number(k);
      const x = iMap[key];
      x.remaining = x.remaining;
      iTopSum += x.topup;
      iUseSum += x.used;
      iRemSum += x.remaining;
    }

    // array perType yang nyaman untuk frontend
    const iPerTypeArray = Object.entries(iMap).map(([id, x]) => ({
      test_type_id: Number(id),
      label: iTypeName[Number(id)] || `Type ${id}`, // ex: "Complete", "Reading", etc
      topup: x.topup,
      used: x.used,
      remaining: x.remaining,
    }));

    // ---- TOEFL: TOPUP & USED ----
    const tTop = await this.db.b2b_org_toefl_quotas.groupBy({
      by: ['test_type_id'],
      where: {
        b2b_org_id: orgId,
        status: true,
        deleted_at: null,
      },
      _sum: { total_quota: true },
    });
    const tUse = await this.db.b2b_org_log_toefl_quotas.groupBy({
      by: ['test_type_id'],
      where: { b2b_org_id: orgId, deleted_at: null },
      _sum: { user_quota: true },
    });

    const tMap: Record<
      number,
      { topup: number; used: number; remaining: number }
    > = {};
    for (const r of tTop) {
      tMap[r.test_type_id] = {
        topup: Number(r._sum.total_quota ?? 0),
        used: 0,
        remaining: 0,
      };
    }
    for (const r of tUse) {
      const k = r.test_type_id;
      if (!tMap[k]) tMap[k] = { topup: 0, used: 0, remaining: 0 };
      tMap[k].used += Number(r._sum.user_quota ?? 0);
    }

    let tTopSum = 0,
      tUseSum = 0,
      tRemSum = 0;
    for (const k of Object.keys(tMap)) {
      const key = Number(k);
      const x = tMap[key];
      x.remaining = Math.max(0, x.topup - x.used);
      tTopSum += x.topup;
      tUseSum += x.used;
      tRemSum += x.remaining;
    }

    const tPerTypeArray = Object.entries(tMap).map(([id, x]) => ({
      test_type_id: Number(id),
      // kalau ada master toefl type, bisa join; sementara pakai label generic
      label: `Type ${id}`,
      topup: x.topup,
      used: x.used,
      remaining: x.remaining,
    }));

    return {
      orgId,
      ielts: {
        totalTopup: iTopSum,
        totalUsed: iUseSum,
        totalRemaining: iRemSum,
        perType: iMap, // bentuk lama (map)
        perTypeArray: iPerTypeArray, // bentuk baru (array)
      },
      toefl: {
        totalTopup: tTopSum,
        totalUsed: tUseSum,
        totalRemaining: tRemSum,
        perType: tMap,
        perTypeArray: tPerTypeArray,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}
