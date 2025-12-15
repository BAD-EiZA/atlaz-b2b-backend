// src/b2b/vouchers/vouchers.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  redeem_vouchers,
  voucher_platform_type,
  voucher_type,
  voucer_test_type,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ApplyVoucherDto } from './dto/apply-voucher.dto';
import { MarkVoucherRedeemedDto } from './dto/mark-redeemed.dto';

type AppliedVoucherInfo = {
  voucherId: number;
  code: string;
  type: voucher_type;
  amount: number;
  discountValue: number;
};

@Injectable()
export class VouchersService {
  constructor(private readonly db: PrismaService) {}

  async apply(dto: ApplyVoucherDto) {
    const now = new Date();

    const rawCodes =
      dto.codes?.map((c) => c.trim().toUpperCase()).filter(Boolean) ?? [];

    if (!rawCodes.length) {
      throw new BadRequestException({
        code: 'NO_CODES',
        message: 'Minimal 1 kode voucher harus diisi.',
      });
    }

    if (dto.baseAmount <= 0) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'baseAmount harus lebih besar dari 0.',
      });
    }

    // 1. Ambil semua voucher dengan kode tsb
    const vouchers = await this.db.redeem_vouchers.findMany({
      where: {
        code: { in: rawCodes },
        status: true,
        platform_type: dto.platform_type, // B2B
        test_type: dto.test_type, // IELTS / TOEFL
        expired_dt: { gte: now },
        deleted_at: null,
      },
    });

    const foundCodeSet = new Set(vouchers.map((v) => v.code.toUpperCase()));
    const invalidCodes: string[] = [];

    // Kode yang tidak ditemukan / tidak aktif / expired
    for (const c of rawCodes) {
      if (!foundCodeSet.has(c)) {
        invalidCodes.push(c);
      }
    }

    if (!vouchers.length) {
      return {
        baseAmount: dto.baseAmount,
        finalAmount: dto.baseAmount,
        totalDiscount: 0,
        applied: [] as AppliedVoucherInfo[],
        invalidCodes,
        message: 'Tidak ada voucher yang dapat digunakan.',
      };
    }

    // 2. Cek one_time di redeemed_user_vouchers
    const used = await this.db.redeemed_user_vouchers.findMany({
      where: {
        user_id: dto.userId,
        voucher_id: { in: vouchers.map((v) => v.id) },
      },
    });
    const usedIds = new Set(used.map((u) => u.voucher_id));

    const usableBeforeStack: redeem_vouchers[] = [];
    for (const v of vouchers) {
      const alreadyUsed = usedIds.has(v.id);
      if (v.one_time && alreadyUsed) {
        invalidCodes.push(v.code.toUpperCase());
        continue;
      }
      usableBeforeStack.push(v);
    }

    if (!usableBeforeStack.length) {
      return {
        baseAmount: dto.baseAmount,
        finalAmount: dto.baseAmount,
        totalDiscount: 0,
        applied: [] as AppliedVoucherInfo[],
        invalidCodes: Array.from(new Set(invalidCodes)),
        message: 'Semua voucher sudah pernah dipakai atau tidak valid.',
      };
    }

    // 3. VALIDASI STACKING via voucher_stack_rules
    const stackedVouchers = await this.filterByStackRules(usableBeforeStack);

    // Kode yang gugur karena melanggar stack rule
    const stackedIdSet = new Set(stackedVouchers.map((v) => v.id));
    for (const v of usableBeforeStack) {
      if (!stackedIdSet.has(v.id)) {
        invalidCodes.push(v.code.toUpperCase());
      }
    }

    if (!stackedVouchers.length) {
      return {
        baseAmount: dto.baseAmount,
        finalAmount: dto.baseAmount,
        totalDiscount: 0,
        applied: [] as AppliedVoucherInfo[],
        invalidCodes: Array.from(new Set(invalidCodes)),
        message:
          'Kombinasi voucher ini tidak diizinkan (melanggar aturan stacking).',
      };
    }

    // 4. Hitung diskon berurutan
    const { finalAmount, applied } = this.calculateDiscount(
      dto.baseAmount,
      stackedVouchers,
    );

    return {
      baseAmount: dto.baseAmount,
      finalAmount,
      totalDiscount: dto.baseAmount - finalAmount,
      applied,
      invalidCodes: Array.from(new Set(invalidCodes)),
    };
  }

  /**
   * Validasi kombinasi voucher berdasarkan tabel voucher_stack_rules
   *
   * Aturan:
   * - Kalau cuma 1 voucher: langsung lolos.
   * - Kalau >1:
   *    - voucher pertama selalu boleh.
   *    - voucher berikutnya hanya ikut kalau SEMUA pasangan (base<->voucher)
   *      punya row di voucher_stack_rules:
   *      (voucherId = A.id AND stackWithId = B.id)
   *      ATAU
   *      (voucherId = B.id AND stackWithId = A.id)
   */
  private async filterByStackRules(
    vouchers: redeem_vouchers[],
  ): Promise<redeem_vouchers[]> {
    if (vouchers.length <= 1) return vouchers;

    const ids = vouchers.map((v) => v.id);

    

    const rules = await this.db.voucher_stack_rules.findMany({
      where: {
        OR: [{ voucherId: { in: ids } }, { stackWithId: { in: ids } }],
      },
    });

    // Kalau sama sekali tidak ada rules, artinya voucher2 ini TIDAK boleh di-stack,
    // jadi pakai voucher pertama saja.
    if (!rules.length) {
      return [vouchers[0]];
    }

    const allowed: redeem_vouchers[] = [];
    allowed.push(vouchers[0]); // voucher pertama selalu lolos

    for (let i = 1; i < vouchers.length; i++) {
      const current = vouchers[i];

      // cek pasangan current dengan SEMUA voucher yang sudah allowed
      const okToStack = allowed.every((base) =>
        rules.some(
          (r) =>
            (r.voucherId === base.id && r.stackWithId === current.id) ||
            (r.voucherId === current.id && r.stackWithId === base.id),
        ),
      );

      if (okToStack) {
        allowed.push(current);
      }
    }

    return allowed;
  }

  /**
   * Hitung diskon berurutan:
   * - PERCENTAGE: diskon = currentAmount * amount / 100
   * - NOMINAL_NUMBERS: diskon = amount
   */
  private calculateDiscount(
    baseAmount: number,
    vouchers: redeem_vouchers[],
  ): {
    finalAmount: number;
    applied: AppliedVoucherInfo[];
  } {
    let currentAmount = baseAmount;
    const applied: AppliedVoucherInfo[] = [];

    for (const v of vouchers) {
      let discount = 0;

      if (v.voucher_type === voucher_type.PERCENTAGE) {
        discount = Math.floor((currentAmount * v.amount) / 100);
      } else if (v.voucher_type === voucher_type.NOMINAL_NUMBERS) {
        discount = v.amount;
      }

      if (discount <= 0) continue;

      currentAmount = Math.max(0, currentAmount - discount);

      applied.push({
        voucherId: v.id,
        code: v.code.toUpperCase(),
        type: v.voucher_type,
        amount: v.amount,
        discountValue: discount,
      });
    }

    return { finalAmount: currentAmount, applied };
  }
}
