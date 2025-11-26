import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type DashboardSummary = {
  activeStudents: number;
  testsConducted: number;
  quotas: {
    used: number;
    total: number;
  };
};

@Injectable()
export class DashboardService {
  constructor(private readonly db: PrismaService) {}

  async getSummary(orgId: number): Promise<DashboardSummary> {
    // 1) Active students (member org, role User)
    const activeStudents = await this.db.b2b_org_members.count({
      where: {
        b2b_org_id: orgId,
        role: 'User',
        status: true,
        deleted_at: null,
        users: {
          status: true,
          deleted_at: null,
        },
      },
    });

    // Ambil semua user id dalam org (untuk hitung tes & quota)
    const members = await this.db.b2b_org_members.findMany({
      where: {
        b2b_org_id: orgId,
        status: true,
        deleted_at: null,
      },
      select: {
        user_id: true,
      },
    });

    const userIds = members.map((m) => m.user_id);

    if (userIds.length === 0) {
      return {
        activeStudents: 0,
        testsConducted: 0,
        quotas: {
          used: 0,
          total: 0,
        },
      };
    }

    /* ------------------------------------------------------------------
     * 2) TESTS CONDUCTED
     *    - ambil dari USER TEST
     *    - IELTS: type = 5 (full test) → ada 4 row token sama → hitung 1
     *    - TOEFL: type = 4 (full test) → sama, distinct token
     *    - pakai count(distinct token) supaya 1 token = 1 test
     * ------------------------------------------------------------------ */

    const [ieltsGrouped, toeflGrouped] = await this.db.$transaction([
      this.db.ieltsUserTest.groupBy({
        by: ['token'],
        where: {
          userId: { in: userIds },
          isEnded: true,
          deletedAt: null,
          token: { not: null }, // jaga-jaga kalau nullable
        },
        // Prisma minta orderBy ketika pakai groupBy (tipe args jadi require)
        orderBy: {
          token: 'asc',
        },
      }),

      this.db.toeflUserTest.groupBy({
        by: ['token'],
        where: {
          userId: { in: userIds },
          isEnded: true,
          deletedAt: null,
        },
        orderBy: {
          token: 'asc',
        },
      }),
    ]);

    const ieltsTests = ieltsGrouped.length;
    const toeflTests = toeflGrouped.length;

    const testsConducted = ieltsTests + toeflTests;

    /* ------------------------------------------------------------------
     * 3) QUOTAS (IELTS + TOEFL)
     * ------------------------------------------------------------------ */
    const [ieltsQuotaAgg, toeflQuotaAgg, ieltsUsedAgg, toeflUsedAgg] =
      await this.db.$transaction([
        // total quota IELTS aktif & belum expired
        this.db.b2b_org_ielts_quotas.aggregate({
          where: {
            b2b_org_id: orgId,
            status: true,
            deleted_at: null,
          },
          _sum: {
            total_quota: true,
          },
        }),

        // total quota TOEFL aktif & belum expired
        this.db.b2b_org_toefl_quotas.aggregate({
          where: {
            b2b_org_id: orgId,
            status: true,
            deleted_at: null,
          },
          _sum: {
            total_quota: true,
          },
        }),

        // quota IELTS yang sudah dialokasikan ke user (user_quota)
        this.db.b2b_org_log_ielts_quotas.aggregate({
          where: {
            b2b_org_id: orgId,
            deleted_at: null,
          },
          _sum: {
            user_quota: true,
          },
        }),

        // quota TOEFL yang sudah dipakai
        this.db.b2b_org_log_toefl_quotas.aggregate({
          where: {
            b2b_org_id: orgId,
            deleted_at: null,
          },
          _sum: {
            user_quota: true,
          },
        }),
      ]);

    const totalQuota =
      Number(ieltsQuotaAgg._sum.total_quota ?? 0) +
      Number(toeflQuotaAgg._sum.total_quota ?? 0);

    const usedQuota =
      Number(ieltsUsedAgg._sum.user_quota ?? 0) +
      Number(toeflUsedAgg._sum.user_quota ?? 0);

    return {
      activeStudents,
      testsConducted,
      quotas: {
        used: usedQuota,
        total: totalQuota,
      },
    };
  }
}
