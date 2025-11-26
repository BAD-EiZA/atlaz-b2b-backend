import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { PaymentHistoryQueryDto } from './dto/history-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgMemberGuard } from '../auth/org-member.guard';

@ApiTags('Payments')
// @ApiBearerAuth()
// @UseGuards(JwtAuthGuard, OrgMemberGuard)
@Controller('b2b/payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post('create-draft')
  @ApiOperation({
    summary: 'Buat draft pembayaran paket kuota (idempoten via externalId)',
  })
  async createDraft(@Body() body: CreateDraftDto) {
    return this.svc.createDraft(body);
  }

  @Get('history')
  @ApiOperation({ summary: 'Riwayat pembayaran organisasi' })
  async history(@Query() q: PaymentHistoryQueryDto) {
    return this.svc.history(q);
  }
}
