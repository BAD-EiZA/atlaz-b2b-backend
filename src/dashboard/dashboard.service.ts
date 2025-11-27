// src/b2b/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TestMode } from './dto/dashboard.dto';

const CEFR_RANK: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
};

const RANK_TO_CEFR: Record<number, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
};

function mapToeflScoreToCefr(
  overall: number | null | undefined,
): string | null {
  if (overall == null) return null;
  if (overall >= 620) return 'C1';
  if (overall >= 543) return 'B2';
  if (overall >= 433) return 'B1';
  if (overall >= 343) return 'A2';
  return 'A1';
}

export interface QuotaByExamTypePoint {
  examType: string;
  totalQuotaBought: number;
  totalQuotaUsed: number;
  remainingQuota: number;
}

export interface MonthlyTestsPoint {
  month: string;
  ielts: number;
  toefl: number;
}

export interface SkillAvgPoint {
  skill: string;
  avgScore: number;
}

export interface RadarPoint {
  label: string;
  students: number;
}

export interface DashboardSummary {
  activeStudents: number;
  testsConducted: number;
  quotas: {
    used: number;
    total: number;
  };
  quotaByExamType: QuotaByExamTypePoint[];
  monthlyTests: MonthlyTestsPoint[];
  ieltsSkillAvg: SkillAvgPoint[];
  toeflSkillAvg: SkillAvgPoint[];
  cefrDistribution: RadarPoint[];
  ieltsBandDistribution: RadarPoint[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly db: PrismaService) {}

  async getSummary(
    orgId: number,
    mode: TestMode = 'all',
    startDate?: string,
    endDate?: string,
  ): Promise<DashboardSummary> {
    /* ------------------------------------------------------------------
     * 0) Date period:
     *    - If startDate/endDate provided → use them
     *    - Else default = last 12 months (from first day 11 months ago)
     * ------------------------------------------------------------------ */
    const now = new Date();

    let periodStart: Date;
    let periodEnd: Date;

    if (startDate) {
      periodStart = new Date(startDate);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 11);
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
    }

    if (endDate) {
      periodEnd = new Date(endDate);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
    }

    /* ------------------------------------------------------------------
     * 1) Active students & member user IDs
     * ------------------------------------------------------------------ */
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

    const members = await this.db.b2b_org_members.findMany({
      where: {
        b2b_org_id: orgId,
        status: true,
        role: 'User',
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
        quotas: { used: 0, total: 0 },
        quotaByExamType: [],
        monthlyTests: [],
        ieltsSkillAvg: [],
        toeflSkillAvg: [],
        cefrDistribution: [],
        ieltsBandDistribution: [],
      };
    }

    /* ------------------------------------------------------------------
     * 2) QUOTA BY EXAM TYPE (current stock, not filtered by date)
     * ------------------------------------------------------------------ */
    const [
      ieltsQuotaByType,
      toeflQuotaByType,
      ieltsUsedByType,
      toeflUsedByType,
      ieltsTypes,
      toeflTypes,
    ] = await this.db.$transaction([
      // total IELTS quota by test type
      this.db.b2b_org_ielts_quotas.groupBy({
        by: ['test_type_id'],
        where: {
          b2b_org_id: orgId,
          status: true,
          deleted_at: null,
        },
        _sum: {
          total_quota: true,
        },
        orderBy: {
          test_type_id: 'asc',
        },
      }),

      // total TOEFL quota by test type
      this.db.b2b_org_toefl_quotas.groupBy({
        by: ['test_type_id'],
        where: {
          b2b_org_id: orgId,
          status: true,
          deleted_at: null,
        },
        _sum: {
          total_quota: true,
        },
        orderBy: {
          test_type_id: 'asc',
        },
      }),

      // used IELTS quota (allocated to users)
      this.db.b2b_org_log_ielts_quotas.groupBy({
        by: ['test_type_id'],
        where: {
          b2b_org_id: orgId,
          deleted_at: null,
        },
        _sum: {
          user_quota: true,
        },
        orderBy: {
          test_type_id: 'asc',
        },
      }),

      // used TOEFL quota (allocated to users)
      this.db.b2b_org_log_toefl_quotas.groupBy({
        by: ['test_type_id'],
        where: {
          b2b_org_id: orgId,
          deleted_at: null,
        },
        _sum: {
          user_quota: true,
        },
        orderBy: {
          test_type_id: 'asc',
        },
      }),

      // master type names
      this.db.ielts_m_type.findMany({
        where: { deleted_at: null },
      }),
      this.db.toefl_m_type.findMany({
        where: { deleted_at: null },
      }),
    ]);

    const ieltsTypeMap = new Map<number, string>();
    ieltsTypes.forEach((t) => {
      if (t.id != null) {
        ieltsTypeMap.set(t.id, t.type ?? `Type ${t.id}`);
      }
    });

    const toeflTypeMap = new Map<number, string>();
    toeflTypes.forEach((t) => {
      if (t.id != null) {
        toeflTypeMap.set(t.id, t.type ?? `Type ${t.id}`);
      }
    });

    const quotaMap = new Map<string, { bought: number; used: number }>();

    // IELTS bought
    for (const row of ieltsQuotaByType) {
      const typeName =
        ieltsTypeMap.get(row.test_type_id) ?? `Type ${row.test_type_id}`;
      const key = `IELTS - ${typeName}`;
      const entry = quotaMap.get(key) ?? { bought: 0, used: 0 };
      entry.bought += Number(row._sum?.total_quota ?? 0);
      quotaMap.set(key, entry);
    }

    // TOEFL bought
    for (const row of toeflQuotaByType) {
      const typeName =
        toeflTypeMap.get(row.test_type_id) ?? `Type ${row.test_type_id}`;
      const key = `TOEFL - ${typeName}`;
      const entry = quotaMap.get(key) ?? { bought: 0, used: 0 };
      entry.bought += Number(row._sum?.total_quota ?? 0);
      quotaMap.set(key, entry);
    }

    // IELTS used
    for (const row of ieltsUsedByType) {
      const typeName =
        ieltsTypeMap.get(row.test_type_id) ?? `Type ${row.test_type_id}`;
      const key = `IELTS - ${typeName}`;
      const entry = quotaMap.get(key) ?? { bought: 0, used: 0 };
      entry.used += Number(row._sum?.user_quota ?? 0);
      quotaMap.set(key, entry);
    }

    // TOEFL used
    for (const row of toeflUsedByType) {
      const typeName =
        toeflTypeMap.get(row.test_type_id) ?? `Type ${row.test_type_id}`;
      const key = `TOEFL - ${typeName}`;
      const entry = quotaMap.get(key) ?? { bought: 0, used: 0 };
      entry.used += Number(row._sum?.user_quota ?? 0);
      quotaMap.set(key, entry);
    }

    const quotaByExamType: QuotaByExamTypePoint[] = [];
    let totalQuota = 0;
    let usedQuota = 0;

    quotaMap.forEach((value, key) => {
      const remaining = Math.max(value.bought - value.used, 0);
      totalQuota += value.bought;
      usedQuota += value.used;
      quotaByExamType.push({
        examType: key,
        totalQuotaBought: value.bought,
        totalQuotaUsed: value.used,
        remainingQuota: remaining,
      });
    });

    /* ------------------------------------------------------------------
     * 3) MONTHLY TESTS (IELTS vs TOEFL) – filtered by date + test mode
     * ------------------------------------------------------------------ */

    const baseIeltsWhere: any = {
      userId: { in: userIds },
      isEnded: true,
      deletedAt: null,
      token: { not: null },
      createdAt: { gte: periodStart, lte: periodEnd },
    };

    const baseToeflWhere: any = {
      userId: { in: userIds },
      isEnded: true,
      deletedAt: null,
      createdAt: { gte: periodStart, lte: periodEnd },
    };

    let whereIeltsForMode: any = { ...baseIeltsWhere };
    let whereToeflForMode: any = { ...baseToeflWhere };

    if (mode === 'complete-only') {
      whereIeltsForMode.type = 5;
      whereToeflForMode.type = 4;
    } else if (mode === 'section-only') {
      whereIeltsForMode.type = { not: 5 };
      whereToeflForMode.type = { not: 4 };
    }

    const [ieltsTestsGrouped, toeflTestsGrouped] = await this.db.$transaction([
      this.db.ieltsUserTest.groupBy({
        by: ['token'],
        where: whereIeltsForMode,
        _min: {
          createdAt: true,
        },
        orderBy: {
          token: 'asc',
        },
      }),
      this.db.toeflUserTest.groupBy({
        by: ['token'],
        where: whereToeflForMode,
        _min: {
          createdAt: true,
        },
        orderBy: {
          token: 'asc',
        },
      }),
    ]);

    const monthMap = new Map<
      string,
      { label: string; ielts: number; toefl: number }
    >();

    const addToMonthMap = (date: Date, exam: 'ielts' | 'toefl') => {
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      const existing =
        monthMap.get(key) ?? { label, ielts: 0, toefl: 0 };
      existing[exam] += 1;
      monthMap.set(key, existing);
    };

    ieltsTestsGrouped.forEach((row) => {
      const createdAt = row._min?.createdAt as Date | null;
      if (createdAt) addToMonthMap(createdAt, 'ielts');
    });

    toeflTestsGrouped.forEach((row) => {
      const createdAt = row._min?.createdAt as Date | null;
      if (createdAt) addToMonthMap(createdAt, 'toefl');
    });

    const monthlyTests: MonthlyTestsPoint[] = Array.from(
      monthMap.entries(),
    )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => ({
        month: value.label,
        ielts: value.ielts,
        toefl: value.toefl,
      }));

    const testsConducted = monthlyTests.reduce(
      (acc, m) => acc + m.ielts + m.toefl,
      0,
    );

    /* ------------------------------------------------------------------
     * 4) SKILL AVERAGES – IELTS & TOEFL (date + test mode)
     * ------------------------------------------------------------------ */

    const [
      ieltsCerts,
      toeflCerts,
      ieltsSkillTests,
      toeflSkillTests,
    ] = await this.db.$transaction([
      // full IELTS certificates (Complete test) – date filtered
      this.db.ieltsFullTestCertificate.findMany({
        where: {
          user_id: { in: userIds },
          test_date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      // full TOEFL certificates – date filtered
      this.db.toeflFullTestCertificate.findMany({
        where: {
          userId: { in: userIds },
          testDate: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      // IELTS section tests (type != 5) – date filtered
      this.db.ieltsUserTest.findMany({
        where: {
          userId: { in: userIds },
          isEnded: true,
          deletedAt: null,
          type: { not: 5 },
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          type: true,
        },
      }),
      // TOEFL section tests (type != 4) – date filtered
      this.db.toeflUserTest.findMany({
        where: {
          userId: { in: userIds },
          isEnded: true,
          deletedAt: null,
          type: { not: 4 },
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          type: true,
        },
      }),
    ]);

    const ieltsSkillTestIds = ieltsSkillTests.map((t) => t.id);
    const toeflSkillTestIds = toeflSkillTests.map((t) => t.id);

    let ieltsSkillResults:
      | { ieltsUserTestId: number; overall: string | null }[] = [];
    let toeflSkillResults:
      | { toeflUserTestId: number; overall: number }[] = [];

    if (ieltsSkillTestIds.length > 0 && mode !== 'complete-only') {
      ieltsSkillResults = await this.db.ieltsUserTestResult.findMany({
        where: {
          ieltsUserTestId: { in: ieltsSkillTestIds },
          deletedAt: null,
        },
        select: {
          ieltsUserTestId: true,
          overall: true,
        },
      });
    }

    if (toeflSkillTestIds.length > 0 && mode !== 'complete-only') {
      toeflSkillResults = await this.db.toeflUserTestResult.findMany({
        where: {
          toeflUserTestId: { in: toeflSkillTestIds },
          deletedAt: null,
        },
        select: {
          toeflUserTestId: true,
          overall: true,
        },
      });
    }

    // IELTS skill totals
    const ieltsSkillTotals: Record<
      string,
      { sum: number; count: number }
    > = {
      Listening: { sum: 0, count: 0 },
      Reading: { sum: 0, count: 0 },
      Writing: { sum: 0, count: 0 },
      Speaking: { sum: 0, count: 0 },
    };

    // 4.a. IELTS – from full-test certificates (only if not section-only)
    if (mode !== 'section-only') {
      for (const cert of ieltsCerts) {
        if (cert.listening_score != null) {
          ieltsSkillTotals.Listening.sum += cert.listening_score;
          ieltsSkillTotals.Listening.count += 1;
        }
        if (cert.reading_score != null) {
          ieltsSkillTotals.Reading.sum += cert.reading_score;
          ieltsSkillTotals.Reading.count += 1;
        }
        if (cert.writing_score != null) {
          ieltsSkillTotals.Writing.sum += cert.writing_score;
          ieltsSkillTotals.Writing.count += 1;
        }
        if (cert.speaking_score != null) {
          ieltsSkillTotals.Speaking.sum += cert.speaking_score;
          ieltsSkillTotals.Speaking.count += 1;
        }
      }
    }

    // map IELTS testId -> typeId for section tests
    const ieltsTestTypeById = new Map<number, number>();
    for (const t of ieltsSkillTests) {
      ieltsTestTypeById.set(t.id, t.type);
    }

    // 4.b. IELTS – from section tests (IeltsUserTestResult.overall)
    if (mode !== 'complete-only') {
      for (const r of ieltsSkillResults) {
        const typeId = ieltsTestTypeById.get(r.ieltsUserTestId);
        if (!typeId) continue;

        const typeName = (
          ieltsTypeMap.get(typeId) ?? ''
        ).toLowerCase();

        let skill: keyof typeof ieltsSkillTotals | null = null;
        if (typeName.includes('listening')) skill = 'Listening';
        else if (typeName.includes('reading')) skill = 'Reading';
        else if (typeName.includes('writing')) skill = 'Writing';
        else if (typeName.includes('speaking')) skill = 'Speaking';

        if (!skill) continue;

        const value = r.overall != null ? Number(r.overall) : NaN;
        if (!Number.isFinite(value)) continue;

        ieltsSkillTotals[skill].sum += value;
        ieltsSkillTotals[skill].count += 1;
      }
    }

    const ieltsSkillAvg: SkillAvgPoint[] = Object.entries(
      ieltsSkillTotals,
    ).map(([skill, v]) => ({
      skill,
      avgScore: v.count > 0 ? v.sum / v.count : 0,
    }));

    // TOEFL skill totals
    const toeflSkillTotals: Record<
      string,
      { sum: number; count: number }
    > = {
      Listening: { sum: 0, count: 0 },
      'Structure & Written Expression': { sum: 0, count: 0 },
      Reading: { sum: 0, count: 0 },
    };

    // 4.c. TOEFL – from full-test certificates (only if not section-only)
    if (mode !== 'section-only') {
      for (const cert of toeflCerts) {
        if (cert.listeningScore != null) {
          toeflSkillTotals.Listening.sum += cert.listeningScore;
          toeflSkillTotals.Listening.count += 1;
        }
        if (cert.structureScore != null) {
          toeflSkillTotals['Structure & Written Expression'].sum +=
            cert.structureScore;
          toeflSkillTotals['Structure & Written Expression'].count += 1;
        }
        if (cert.readingScore != null) {
          toeflSkillTotals.Reading.sum += cert.readingScore;
          toeflSkillTotals.Reading.count += 1;
        }
      }
    }

    // map TOEFL testId -> typeId for section tests
    const toeflTestTypeById = new Map<number, number>();
    for (const t of toeflSkillTests) {
      toeflTestTypeById.set(t.id, t.type);
    }

    // 4.d. TOEFL – from section tests (ToeflUserTestResult.overall)
    if (mode !== 'complete-only') {
      for (const r of toeflSkillResults) {
        const typeId = toeflTestTypeById.get(r.toeflUserTestId);
        if (!typeId) continue;

        const typeName = (
          toeflTypeMap.get(typeId) ?? ''
        ).toLowerCase();

        let skill: keyof typeof toeflSkillTotals | null = null;
        if (typeName.includes('listening')) {
          skill = 'Listening';
        } else if (typeName.includes('structure')) {
          skill = 'Structure & Written Expression';
        } else if (typeName.includes('reading')) {
          skill = 'Reading';
        }

        if (!skill) continue;

        const value = Number(r.overall);
        if (!Number.isFinite(value)) continue;

        toeflSkillTotals[skill].sum += value;
        toeflSkillTotals[skill].count += 1;
      }
    }

    const toeflSkillAvg: SkillAvgPoint[] = Object.entries(
      toeflSkillTotals,
    ).map(([skill, v]) => ({
      skill,
      avgScore: v.count > 0 ? v.sum / v.count : 0,
    }));

    /* ------------------------------------------------------------------
     * 5) CEFR DISTRIBUTION (A1–C1) – best level per student (date-filtered)
     * ------------------------------------------------------------------ */

    const bestCefrRankByUser = new Map<number, number>();

    // IELTS certificates (cefr_level)
    for (const cert of toeflCerts) {
      const raw = cert.cefrLevel?.trim().toUpperCase();
      if (!raw) continue;
      const rank = CEFR_RANK[raw];
      if (!rank) continue;
      const current = bestCefrRankByUser.get(cert.userId) ?? 0;
      if (rank > current) bestCefrRankByUser.set(cert.userId, rank);
    }

    // TOEFL certificates (cefrLevel or mapping from overall)
    for (const cert of toeflCerts) {
      let cefr =
        cert.cefrLevel?.trim().toUpperCase() ??
        mapToeflScoreToCefr(cert.overall ?? null);
      if (!cefr) continue;
      cefr = cefr.toUpperCase();
      const rank = CEFR_RANK[cefr];
      if (!rank) continue;
      const current = bestCefrRankByUser.get(cert.userId) ?? 0;
      if (rank > current) bestCefrRankByUser.set(cert.userId, rank);
    }

    const cefrCount: Record<string, number> = {
      A1: 0,
      A2: 0,
      B1: 0,
      B2: 0,
      C1: 0,
    };

    bestCefrRankByUser.forEach((rank) => {
      const label = RANK_TO_CEFR[rank];
      if (label) {
        cefrCount[label] += 1;
      }
    });

    const cefrDistribution: RadarPoint[] = Object.entries(
      cefrCount,
    ).map(([label, students]) => ({ label, students }));

    /* ------------------------------------------------------------------
     * 6) IELTS BAND DISTRIBUTION (3.0–9.0) – best band per student (date-filtered)
     * ------------------------------------------------------------------ */

    const allowedBands = [
      3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
    ];

    const bestBandByUser = new Map<number, number>();

    for (const cert of ieltsCerts) {
      if (cert.overall_band == null) continue;
      let band = cert.overall_band;
      band = Math.round(band * 2) / 2; // round to nearest 0.5
      if (band < 3 || band > 9) continue;
      const current = bestBandByUser.get(cert.user_id) ?? 0;
      if (band > current) bestBandByUser.set(cert.user_id, band);
    }

    const bandCount = new Map<string, number>();
    allowedBands.forEach((b) => {
      bandCount.set(b.toFixed(1), 0);
    });

    bestBandByUser.forEach((band) => {
      const key = band.toFixed(1);
      if (bandCount.has(key)) {
        bandCount.set(key, (bandCount.get(key) ?? 0) + 1);
      }
    });

    const ieltsBandDistribution: RadarPoint[] = Array.from(
      bandCount.entries(),
    )
      .sort(
        ([a], [b]) => parseFloat(a) - parseFloat(b),
      )
      .map(([label, students]) => ({ label, students }));

    return {
      activeStudents,
      testsConducted,
      quotas: {
        used: usedQuota,
        total: totalQuota,
      },
      quotaByExamType,
      monthlyTests,
      ieltsSkillAvg,
      toeflSkillAvg,
      cefrDistribution,
      ieltsBandDistribution,
    };
  }
}
