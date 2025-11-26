import { Injectable } from '@nestjs/common';
import { parsePagination } from '../shared/paginate.util';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private readonly db: PrismaService) {}

  async summary(userId: number) {
    const ieltsCert = await this.db.ieltsFullTestCertificate.findFirst({
      where: { user_id: userId },
      orderBy: [{ test_date: 'desc' }, { id: 'desc' }],
    });
    const ieltsQuick = await this.db.ieltsUserTestResult.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const ielts = ieltsCert
      ? {
          kind: 'certificate',
          overall_band: ieltsCert.overall_band,
          cefr_level: ieltsCert.cefr_level,
          test_date: ieltsCert.test_date,
        }
      : ieltsQuick
        ? {
            kind: 'quick',
            overall: ieltsQuick.overall,
            createdAt: ieltsQuick.createdAt,
          }
        : null;

    const toeflCert = await this.db.toeflFullTestCertificate.findFirst({
      where: { userId },
      orderBy: [{ testDate: 'desc' }, { id: 'desc' }],
    });
    const toeflQuick = await this.db.toeflUserTestResult.findFirst({
      where: { userTest: { userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { userTest: { select: { type: true, createdAt: true } } },
    });

    const toefl = toeflCert
      ? {
          kind: 'certificate',
          overall: toeflCert.overall,
          cefrLevel: toeflCert.cefrLevel,
          testDate: toeflCert.testDate,
        }
      : toeflQuick
        ? {
            kind: 'quick',
            overall: toeflQuick.overall,
            createdAt: toeflQuick.createdAt,
          }
        : null;

    return { userId, ielts, toefl };
  }

  async history(userId: number, page = 1, pageSize = 20) {
    const { skip, take } = parsePagination(page, pageSize);

    const ieltsQuick = await this.db.ieltsUserTestResult.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
    const ieltsFull = await this.db.ieltsFullTestCertificate.findMany({
      where: { user_id: userId },
      orderBy: [{ test_date: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
    const toeflQuick = await this.db.toeflUserTestResult.findMany({
      where: { userTest: { userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      include: { userTest: { select: { type: true, createdAt: true } } },
    });
    const toeflFull = await this.db.toeflFullTestCertificate.findMany({
      where: { userId },
      orderBy: [{ testDate: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });

    return {
      userId,
      page,
      pageSize,
      ieltsQuick,
      ieltsFull,
      toeflQuick,
      toeflFull,
    };
  }
}
