import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateDraftDto } from './dto/create-draft.dto';
import { PaymentHistoryQueryDto } from './dto/history-query.dto';
import { parsePagination } from '../shared/paginate.util';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly db: PrismaService) {}

  async createDraft(dto: CreateDraftDto) {
    const exists = await this.db.b2b_org_payment_histories.findFirst({
      where: { externalId: dto.externalId },
    });
    if (exists)
      throw new BadRequestException({
        code: 'DUPLICATE_EXTERNAL_ID',
        message: 'externalId sudah terdaftar',
      });

    const row = await this.db.b2b_org_payment_histories.create({
      data: {
        orgId: dto.orgId,
        userId: dto.userId || 0,
        externalId: dto.externalId,
        status: 'PENDING',
        method: dto.method,
        channel: dto.channel,
        amount: dto.amount,
        currency: dto.currency,
      },
    });
    return { ok: true, draft: row };
  }

  async history(q: PaymentHistoryQueryDto) {
    const { page = 1, pageSize = 50 } = q;
    const { skip, take } = parsePagination(page, pageSize);

    const where: any = { orgId: q.orgId, deleted_at: null };
    if (q.status) where.status = q.status;
    if (q.method) where.method = q.method;
    if (q.channel) where.channel = q.channel;
    if (q.currency) where.currency = q.currency;
    if (q.externalId) where.externalId = q.externalId;
    if (q.date_from || q.date_to) {
      where.created_at = {};
      if (q.date_from) where.created_at.gte = new Date(q.date_from);
      if (q.date_to) where.created_at.lte = new Date(q.date_to);
    }

    const [total, data] = await this.db.$transaction([
      this.db.b2b_org_payment_histories.count({ where }),
      this.db.b2b_org_payment_histories.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    return { data, total, page, pageSize };
  }
}
