// src/b2b/vouchers/vouchers.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';
import { ApplyVoucherDto } from './dto/apply-voucher.dto';
import { MarkVoucherRedeemedDto } from './dto/mark-redeemed.dto';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // kalau mau pakai JWT

@ApiTags('B2B Vouchers')
@Controller()
export class VouchersController {
  constructor(private readonly svc: VouchersService) {}

  @Post('b2b/voucher/apply')
  @ApiOperation({
    summary: 'Validate & preview vouchers (stacking, one_time, discount)',
  })
  // @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async apply(@Body() dto: ApplyVoucherDto) {
    return this.svc.apply(dto);
  }

}
