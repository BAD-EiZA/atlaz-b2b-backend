import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuotasService } from './quotas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgMemberGuard } from '../auth/org-member.guard';
import { OrgAdminGuard } from '../auth/org-admin.guard';
import { AllocateQuotaDto } from './dto/allocate-quota.dto';
import { RevokeQuotaDto } from './dto/revoke-quota.dto';

@ApiTags('Quotas')
// @ApiBearerAuth()
// @UseGuards(JwtAuthGuard, OrgMemberGuard)
@Controller('b2b/orgs/:orgId/quotas')
export class QuotasController {
  constructor(private readonly svc: QuotasService) {}

  // @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @Post('allocate')
  @ApiOperation({ summary: 'Alokasikan kuota dari org ke user' })
  async allocate(@Param('orgId') orgId: string, @Body() dto: AllocateQuotaDto) {
    return this.svc.allocate(Number(orgId), dto);
  }

  // @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @Post('revoke')
  @ApiOperation({ summary: 'Tarik kembali kuota dari user ke org' })
  async revoke(@Param('orgId') orgId: string, @Body() dto: RevokeQuotaDto) {
    return this.svc.revoke(Number(orgId), dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Ringkasan sisa kuota org (IELTS/TOEFL)' })
  async summary(@Param('orgId', ParseIntPipe) orgId: number) {
    // langsung forward ke service.summary
    return this.svc.summary(orgId);
  }
}
