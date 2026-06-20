import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListMembersDto } from './dto/list-members.dto';
import { B2bTestName, CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { BulkCreateMembersDto } from './dto/bulk-create-member.dto';

const IELTS_LABELS: Record<number, string> = {
  1: 'Listening',
  2: 'Reading',
  3: 'Writing',
  4: 'Speaking',
  5: 'Complete',
};

const TOEFL_LABELS: Record<number, string> = {
  1: 'Listening',
  2: 'Structure & Written Expression',
  3: 'Reading',
  4: 'Complete',
};

@Injectable()
export class MembersService {
  constructor(private readonly db: PrismaService) {}

  async list(orgId: number, dto: ListMembersDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // 1. Setup Filter Pencarian User
    const where: any = { b2b_org_id: orgId, role: 'User', deleted_at: null };
    if (dto.role) where.role = dto.role;
    if (dto.status !== undefined)
      where.status = String(dto.status).toLowerCase() === 'true';
    const search = dto.q?.trim();
    if (search) {
      where.OR = [
        { users: { name: { contains: search } } },
        { users: { email: { contains: search } } },
      ];
    }

    // 2. Ambil Data Member (Pagination)
    const [total, members] = await this.db.$transaction([
      this.db.b2b_org_members.count({ where }),
      this.db.b2b_org_members.findMany({
        where,
        include: { users: { select: { id: true, name: true, email: true } } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const userIds = members.map((m) => m.user_id).filter(Boolean);

    // --- Helper Struktur Data ---
    const defaultItem = () => ({ count: 0, expiry: null as Date | null });
    const mkDefaultQuota = () => ({
      IELTS: {
        Reading: defaultItem(),
        Listening: defaultItem(),
        Writing: defaultItem(),
        Speaking: defaultItem(),
        Complete: defaultItem(),
      },
      TOEFL: {
        Reading: defaultItem(),
        Listening: defaultItem(),
        'Structure & Written Expression': defaultItem(),
        Complete: defaultItem(),
      },
    });

    // Jika tidak ada user, return langsung
    if (!userIds.length) {
      const data = members.map((m) => ({ ...m, quotas: mkDefaultQuota() }));
      return { data, total, page, pageSize };
    }

    // 3. Ambil Aggregasi Quota & Usage
    const [ieltsQuotaAgg, toeflQuotaAgg, ieltsUsageRaw, toeflUsageRaw] =
      await this.db.$transaction([
        // A. Quota IELTS
        this.db.ielts_user_quota.groupBy({
          by: ['user_id', 'package_type'],
          where: {
            user_id: { in: userIds },
            deleted_at: null,
            expired_date: { gt: new Date() },
          },
          _sum: { quota: true },
          _max: { expired_date: true },
          orderBy: { package_type: 'asc' },
        }),

        // B. Quota TOEFL
        this.db.toefl_user_quota.groupBy({
          by: ['user_id', 'package_type'],
          where: {
            user_id: { in: userIds },
            deleted_at: null,
            // expired_date check jika perlu
          },
          _sum: { quota: true },
          _max: { expired_date: true },
          orderBy: { package_type: 'asc' },
        }),

        // C. Usage IELTS (Raw Data untuk hitung distinct token)
        this.db.ieltsUserTest.findMany({
          where: {
            userId: { in: userIds },
            deletedAt: null,
          },
          select: {
            userId: true,
            type: true,
            token: true,
          },
        }),

        // D. Usage TOEFL (UBAH DARI groupBy KE findMany)
        // Agar bisa menghitung distinct token untuk Type 4 (3 row = 1 usage)
        this.db.toeflUserTest.findMany({
          where: {
            userId: { in: userIds },
            deletedAt: null,
          },
          select: {
            userId: true,
            type: true,
            token: true,
          },
        }),
      ]);

    // 4. Inisialisasi Map
    const quotaMap = new Map<number, ReturnType<typeof mkDefaultQuota>>();
    for (const uid of userIds) {
      quotaMap.set(uid, mkDefaultQuota());
    }

    // --- HELPER: Process Usage Map (Distinct Token Counting) ---
    const buildUsageMap = (
      rawData: { userId: number; type: number; token: string | null }[],
    ) => {
      const map = new Map<string, Set<string>>(); // Key: "userId-type", Value: Set<token>
      for (const row of rawData) {
        if (!row.token) continue;
        const key = `${row.userId}-${row.type}`;
        if (!map.has(key)) {
          map.set(key, new Set());
        }
        map.get(key)!.add(row.token);
      }
      return map;
    };

    const ieltsUsageMap = buildUsageMap(ieltsUsageRaw);
    const toeflUsageMap = buildUsageMap(toeflUsageRaw); // Proses data TOEFL

    // --- LOGIKA MAPPING IELTS ---
    const IELTS_KEY_MAP: Record<
      number,
      keyof ReturnType<typeof mkDefaultQuota>['IELTS']
    > = {
      1: 'Listening',
      2: 'Reading',
      3: 'Writing',
      4: 'Speaking',
      5: 'Complete',
      7: 'Complete',
    };

    // A. Tambah Quota IELTS
    for (const row of ieltsQuotaAgg) {
      const q = quotaMap.get(row.user_id);
      const key = IELTS_KEY_MAP[row.package_type!];
      if (q && key) {
        q.IELTS[key].count += Number(row._sum?.quota ?? 0);
        q.IELTS[key].expiry = row._max?.expired_date ?? null;
      }
    }

    // B. Kurangi Usage IELTS
    for (const uid of userIds) {
      const q = quotaMap.get(uid);
      if (!q) continue;

      for (const [typeIdStr, key] of Object.entries(IELTS_KEY_MAP)) {
        const typeId = Number(typeIdStr);
        const usageKey = `${uid}-${typeId}`;
        const tokens = ieltsUsageMap.get(usageKey);

        if (tokens && tokens.size > 0) {
          const usedCount = tokens.size;
          q.IELTS[key].count = Math.max(0, q.IELTS[key].count - usedCount);
          if (q.IELTS[key].count === 0) q.IELTS[key].expiry = null;
        }
      }
    }

    // --- LOGIKA MAPPING TOEFL ---
    const TOEFL_KEY_MAP: Record<
      number,
      keyof ReturnType<typeof mkDefaultQuota>['TOEFL']
    > = {
      1: 'Listening',
      2: 'Structure & Written Expression',
      3: 'Reading',
      4: 'Complete',
    };

    // C. Tambah Quota TOEFL
    for (const row of toeflQuotaAgg) {
      const q = quotaMap.get(row.user_id);
      const key = TOEFL_KEY_MAP[row.package_type!];
      if (q && key) {
        q.TOEFL[key].count += Number(row._sum?.quota ?? 0);
        q.TOEFL[key].expiry = row._max?.expired_date ?? null;
      }
    }

    // D. Kurangi Usage TOEFL (Sekarang menggunakan Logic Distinct Token)
    for (const uid of userIds) {
      const q = quotaMap.get(uid);
      if (!q) continue;

      for (const [typeIdStr, key] of Object.entries(TOEFL_KEY_MAP)) {
        const typeId = Number(typeIdStr);
        const usageKey = `${uid}-${typeId}`;
        const tokens = toeflUsageMap.get(usageKey);

        if (tokens && tokens.size > 0) {
          // tokens.size akan mengembalikan 1 jika ada 3 row dengan token yang sama
          const usedCount = tokens.size;
          q.TOEFL[key].count = Math.max(0, q.TOEFL[key].count - usedCount);
          if (q.TOEFL[key].count === 0) q.TOEFL[key].expiry = null;
        }
      }
    }

    // 5. Final Result
    const data = members.map((m) => ({
      ...m,
      quotas: quotaMap.get(m.user_id) ?? mkDefaultQuota(),
    }));

    return { data, total, page, pageSize };
  }

  async bulkAdd(orgId: number, dto: BulkCreateMembersDto) {
    const findAdmin = await this.db.b2b_org_members.findFirst({
      where: {
        b2b_org_id: orgId,
        role: 'Admin',
      },
    });

    const results: {
      ok: boolean;
      index: number;
      email?: string;
      username?: string;
      memberId?: number;
      error?: { code: string; message: string };
    }[] = [];

    for (let i = 0; i < dto.users.length; i++) {
      const row = dto.users[i];

      try {
        const member = await this.add(orgId, row, findAdmin?.user_id);

        results.push({
          ok: true,
          index: i,
          email: row.email,
          username: row.username,
          memberId: member.id,
        });
      } catch (err) {
        let code = 'UNKNOWN_ERROR';
        let message = 'Unexpected error';

        if (
          err instanceof BadRequestException ||
          err instanceof NotFoundException
        ) {
          const resp: any = err.getResponse();
          code = resp?.code || code;
          message = resp?.message || err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }

        results.push({
          ok: false,
          index: i,
          email: row.email,
          username: row.username,
          error: { code, message },
        });
      }
    }

    const success = results.filter((r) => r.ok).length;
    const failed = results.length - success;

    return {
      ok: true,
      orgId,
      total: results.length,
      success,
      failed,
      results,
    };
  }

  async getMyOrg(userId: number) {
    const member = await this.db.b2b_org_members.findFirst({
      where: {
        user_id: userId,
        deleted_at: null,
        status: true,
      },
      include: {
        b2b_org: {
          select: {
            id: true,
            name: true,
            logo: true,
            status: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            user_profile: {
              select: {
                nationality: true,
                country_origin: true,
                first_language: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' }, // kalau suatu saat punya >1 org, ambil yang pertama dulu
    });

    if (!member) {
      return {
        ok: true,
        inOrg: false,
      };
    }

    const profile = member.users.user_profile;

    return {
      ok: true,
      inOrg: true,
      orgId: member.b2b_org_id,
      org: member.b2b_org,
      user: {
        id: member.users.id,
        name: member.users.name,
        email: member.users.email,
        username: member.users.username,
      },
      profile: profile
        ? {
            nationality: profile.nationality,
            country_origin: profile.country_origin,
            first_language: profile.first_language,
          }
        : null,
    };
  }

  async add(
    orgId: number,
    dto: CreateMemberDto,
    adminId?: number,
    phone?: string,
  ) {
    const adminIdUse = adminId ?? 1; // fallback kalau belum di-pass

    return this.db.$transaction(async (tx) => {
      const now = new Date();

      // ---------- 0. Pastikan org ada ----------
      const org = await tx.b2b_orgs.findFirst({
        where: { id: orgId, deleted_at: null },
      });
      if (!org) {
        throw new NotFoundException({
          code: 'ORG_NOT_FOUND',
          message: 'Organisasi tidak ditemukan',
        });
      }

      // ---------- 1. VALIDASI & CEK DUPLIKASI USER ----------
      if (!dto.name || !dto.email || !dto.username) {
        throw new BadRequestException({
          code: 'USER_DATA_REQUIRED',
          message:
            'Untuk membuat user baru, name, email, dan username wajib diisi',
        });
      }

      const existing = await tx.users.findFirst({
        where: {
          deleted_at: null,
          OR: [{ username: dto.username }, { email: dto.email }],
        },
      });

      if (existing) {
        const conflicts: string[] = [];
        if (existing.username === dto.username) conflicts.push('username');
        if (existing.email && existing.email === dto.email)
          conflicts.push('email');

        throw new BadRequestException({
          code: 'USER_DUPLICATE',
          message:
            conflicts.length === 2
              ? 'Username dan email sudah terdaftar'
              : conflicts[0] === 'username'
                ? 'Username sudah terdaftar'
                : 'Email sudah terdaftar',
        });
      }

      // ---------- 2. BUAT USER BARU ----------
      const hashedPassword = dto.password
        ? await bcrypt.hash(dto.password, 10)
        : null;

      const referral_code =
        'B2B-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2, 8);

      const user = await tx.users.create({
        data: {
          name: dto.name,
          email: dto.email,
          username: dto.username,
          password: hashedPassword,
          referral_code,
          role_id: 4,
          status: true,
          phone: phone ?? dto.phone ?? '0782377726',
        },
      });

      // ---------- 2A. BUAT user_profiles DENGAN DATA DARI DTO ----------
      await tx.user_profiles.create({
        data: {
          user_id: user.id,
          nationality: dto.nationality ?? 'Indonesian',
          country_origin: dto.country_origin ?? 'Indonesia',
          first_language: dto.first_language ?? 'Indonesian',
        },
      });

      // ---------- 3. CEK & KURANGI ORG QUOTA + LOG (MULTI SKILL) ----------
      if (!dto.quotas || dto.quotas.length === 0) {
        throw new BadRequestException({
          code: 'QUOTAS_REQUIRED',
          message: 'Minimal harus ada 1 item quotas untuk member baru',
        });
      }

      const currency = dto.currency ?? 'IDR';
      const expiredDate = new Date();
      expiredDate.setFullYear(expiredDate.getFullYear() + 2);

      // Loop semua skill yang mau dialokasikan
      for (const q of dto.quotas) {
        const { test_name, test_type_id, quota } = q;

        let totalAvailable = 0;
        let orgQuotaLeft = 0;

        if (test_name === B2bTestName.IELTS) {
          const orgQuotas = await tx.b2b_org_ielts_quotas.findMany({
            where: {
              b2b_org_id: orgId,
              test_type_id,
              status: true,
              deleted_at: null,
              total_quota: { gt: 0 },
            },
            // optional: orderBy expired_dt kalau ada
          });

          totalAvailable = orgQuotas.reduce(
            (sum, row) => sum + row.total_quota,
            0,
          );

          if (totalAvailable < quota) {
            throw new BadRequestException({
              code: 'ORG_QUOTA_NOT_ENOUGH',
              message: `Quota organisasi untuk IELTS type ${test_type_id} tidak mencukupi untuk dialokasikan ke user ini`,
            });
          }

          let remaining = quota;
          for (const row of orgQuotas) {
            if (remaining <= 0) break;

            const use = Math.min(remaining, row.total_quota);
            const newTotal = row.total_quota - use;

            await tx.b2b_org_ielts_quotas.update({
              where: { id: row.id },
              data: { total_quota: newTotal },
            });

            remaining -= use;
          }

          orgQuotaLeft = totalAvailable - quota;

          await tx.b2b_org_log_ielts_quotas.create({
            data: {
              b2b_org_id: orgId,
              admin_id: adminIdUse,
              user_id: user.id,
              test_type_id,
              user_quota: quota,
              org_quota_left: orgQuotaLeft,
            },
          });

          // ---------- 4A. ASSIGN QUOTA KE USER (IELTS) ----------
          await tx.ielts_user_quota.create({
            data: {
              user_id: user.id,
              package_type: test_type_id,
              quota,
              currency,
              expired_date: expiredDate,
            },
          });
        } else if (test_name === B2bTestName.TOEFL) {
          const orgQuotas = await tx.b2b_org_toefl_quotas.findMany({
            where: {
              b2b_org_id: orgId,
              test_type_id,
              status: true,
              deleted_at: null,
              total_quota: { gt: 0 },
            },
            orderBy: { expired_dt: 'asc' },
          });

          totalAvailable = orgQuotas.reduce(
            (sum, row) => sum + row.total_quota,
            0,
          );

          if (totalAvailable < quota) {
            throw new BadRequestException({
              code: 'ORG_QUOTA_NOT_ENOUGH',
              message: `Quota organisasi untuk TOEFL type ${test_type_id} tidak mencukupi untuk dialokasikan ke user ini`,
            });
          }

          let remaining = quota;
          for (const row of orgQuotas) {
            if (remaining <= 0) break;

            const use = Math.min(remaining, row.total_quota);
            const newTotal = row.total_quota - use;

            await tx.b2b_org_toefl_quotas.update({
              where: { id: row.id },
              data: { total_quota: newTotal },
            });

            remaining -= use;
          }

          orgQuotaLeft = totalAvailable - quota;

          await tx.b2b_org_log_toefl_quotas.create({
            data: {
              b2b_org_id: orgId,
              admin_id: adminIdUse,
              user_id: user.id,
              test_type_id,
              user_quota: quota,
              org_quota_left: orgQuotaLeft,
            },
          });

          // ---------- 4B. ASSIGN QUOTA KE USER (TOEFL) ----------
          await tx.toefl_user_quota.create({
            data: {
              user_id: user.id,
              package_type: test_type_id,
              quota,
              currency,
              expired_date: expiredDate,
              payment_transaction_id: null,
            },
          });
        } else {
          throw new BadRequestException({
            code: 'INVALID_TEST_NAME',
            message: 'test_name harus IELTS atau TOEFL',
          });
        }
      }

      // ---------- 5. CEK MEMBER (harusnya belum ada) ----------
      const existsMember = await tx.b2b_org_members.findFirst({
        where: { b2b_org_id: orgId, user_id: user.id, deleted_at: null },
      });

      if (existsMember) {
        throw new BadRequestException({
          code: 'ALREADY_MEMBER',
          message: 'User sudah menjadi anggota org ini',
        });
      }

      // ---------- 6. CREATE MEMBERSHIP ----------
      const member = await tx.b2b_org_members.create({
        data: {
          b2b_org_id: orgId,
          user_id: user.id,
          role: 'User',
          status: true,
        },
        include: {
          users: { select: { id: true, name: true, email: true } },
        },
      });

      return member;
    });
  }

  async updateStatus(
    orgId: number,
    memberId: number,
    body: UpdateMemberStatusDto,
  ) {
    const found = await this.db.b2b_org_members.findFirst({
      where: { id: memberId, b2b_org_id: orgId, deleted_at: null },
    });
    if (!found)
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Member tidak ditemukan',
      });

    await this.db.b2b_org_members.update({
      where: { id: found.id },
      data: { status: body.status },
    });
    return { ok: true, id: found.id, status: body.status };
  }
}
