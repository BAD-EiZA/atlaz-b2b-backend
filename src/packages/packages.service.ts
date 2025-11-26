// src/b2b/packages/org-packages.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrgPackagesQueryDto } from './dto/packages-query.dto';

type Category = 'IELTS' | 'TOEFL';

// currency yang didukung di b2b_org_price
const ALLOWED_CURRENCIES = ['IDR', 'USD', 'MMK', 'VND', 'THB', 'MYR'] as const;
type Currency = (typeof ALLOWED_CURRENCIES)[number];

// helper ambil harga dari row b2b_org_price
const pickPrice = (row: any, currency: Currency): number => {
  const n = (x: any) => Number(x ?? 0);

  switch (currency) {
    case 'IDR':
      return n(row.price_idr);
    case 'USD':
      return n(row.price_usd);
    case 'MMK':
      return n(row.price_mmk);
    case 'VND':
      return n(row.price_vnd);
    case 'THB':
      return n(row.price_thb);
    case 'MYR':
      return n(row.price_myr);
    default:
      return n(row.price_idr);
  }
};

@Injectable()
export class OrgPackagesService {
  constructor(private readonly db: PrismaService) {}

  private getTestTypeLabel(category: Category, test_type_id: number): string {
    if (category === 'IELTS') {
      // IELTS: 1 = Listening, 2=Reading, 3=Writing, 4=Speaking 5=Complete
      switch (test_type_id) {
        case 1:
          return 'Listening';
        case 2:
          return 'Reading';
        case 3:
          return 'Writing';
        case 4:
          return 'Speaking';
        case 5:
          return 'Complete';
        default:
          return `Type ${test_type_id}`;
      }
    }

    // TOEFL: 1 = Listening, 2=Structure, 3=Reading, 4=Complete
    switch (test_type_id) {
      case 1:
        return 'Listening';
      case 2:
        return 'Structure';
      case 3:
        return 'Reading';
      case 4:
        return 'Complete';
      default:
        return `Type ${test_type_id}`;
    }
  }

  async listAvailable(query: OrgPackagesQueryDto) {
    const where: any = {
      status: true,
      deleted_at: null,
    };

    if (query.test_category) {
      where.test_category = query.test_category;
    }
    if (typeof query.test_type_id === 'number') {
      where.test_type_id = query.test_type_id;
    }

    // untuk saat ini kita pakai default IDR,
    // nanti kalau mau bisa extend OrgPackagesQueryDto dengan field currency
    const currency: Currency = 'IDR';

    const rows = await this.db.b2b_org_package.findMany({
      where,
      include: {
        prices: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 1, // pakai price terbaru per package
        },
      },
      orderBy: [
        { test_category: 'asc' },
        { test_type_id: 'asc' },
        { attempt_quota: 'desc' },
        { id: 'asc' },
      ],
    });

    // Group per category & per test_type_id
    const byCategory: Record<
      string,
      {
        test_category: string;
        test_types: Record<
          number,
          {
            test_type_id: number;
            label: string; // Listening/Reading/Complete/etc
            packages: {
              id: number;
              title: string;
              attempt_quota: number;
              price: string; // string untuk backward compatibility
              priceInt: number;
              currency: string;
            }[];
          }
        >;
      }
    > = {};

    for (const row of rows) {
      const cat = row.test_category as Category | string;

      if (!byCategory[cat]) {
        byCategory[cat] = {
          test_category: cat,
          test_types: {},
        };
      }

      const categoryTyped: Category =
        cat === 'IELTS' || cat === 'TOEFL' ? cat : 'IELTS';

      const label = this.getTestTypeLabel(categoryTyped, row.test_type_id);

      if (!byCategory[cat].test_types[row.test_type_id]) {
        byCategory[cat].test_types[row.test_type_id] = {
          test_type_id: row.test_type_id,
          label,
          packages: [],
        };
      }

      const typeGroup = byCategory[cat].test_types[row.test_type_id];

      // ambil 1 row harga (kalau ada)
      const priceRow = row.prices?.[0];
      const numericPrice = priceRow ? pickPrice(priceRow, currency) : 0;

      typeGroup.packages.push({
        id: row.id,
        // Kalau title kosong, generate Title = "<Label> x <attempt_quota>"
        title:
          row.title && row.title.trim().length > 0
            ? row.title
            : `${label} x ${row.attempt_quota}`,
        attempt_quota: row.attempt_quota,
        price: numericPrice.toString(), // supaya shape response sama seperti sebelumnya (string)
        priceInt: numericPrice,
        currency,
      });
    }

    // Normalisasi output: pisahkan IELTS & TOEFL biar gampang dipakai di frontend
    return {
      ielts: byCategory['IELTS'] || {
        test_category: 'IELTS',
        test_types: {},
      },
      toefl: byCategory['TOEFL'] || {
        test_category: 'TOEFL',
        test_types: {},
      },
    };
  }
}
