import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembersService } from './members.service';
import { ListMembersDto } from './dto/list-members.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgMemberGuard } from '../auth/org-member.guard';
import { OrgAdminGuard } from '../auth/org-admin.guard';
import { BulkCreateMembersDto } from './dto/bulk-create-member.dto';

@ApiTags('Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('b2b')
export class MembersController {
  constructor(private readonly svc: MembersService) {}

  /**
   * Cek organisasi tempat user terdaftar
   * GET /v1/b2b/me/org
   */
  @Get('me/org')
  @ApiOperation({
    summary: 'Ambil organisasi tempat user saat ini menjadi member',
  })
  async getMyOrg(@Req() req) {
    // payload dari JWT strategy biasanya return { id, name, email, ... }
    console.log(req, 'RT');
    const userId = Number(req.user.id);
    return this.svc.getMyOrg(userId);
  }

  /**
   * Daftar anggota organisasi
   * GET /v1/b2b/orgs/:orgId/members
   */
  @Get('orgs/:orgId/members')
  @ApiOperation({ summary: 'Daftar anggota organisasi' })
  async list(@Param('orgId') orgId: string, @Query() q: ListMembersDto) {
    return this.svc.list(Number(orgId), q);
  }

  /**
   * Tambah anggota baru
   * POST /v1/b2b/orgs/:orgId/members
   */
  @Post('orgs/:orgId/members')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  @ApiOperation({ summary: 'Tambah anggota baru' })
  async add(@Param('orgId') orgId: string, @Body() body: CreateMemberDto) {
    return this.svc.add(Number(orgId), body);
  }

  @Post('orgs/:orgId/members/bulk')
  async bulkCreateMembers(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() body: BulkCreateMembersDto,
  ) {
    return this.svc.bulkAdd(orgId, body);
  }

  /**
   * Ubah status aktif/nonaktif anggota
   * PATCH /v1/b2b/orgs/:orgId/members/:memberId/status
   */
  @Patch('orgs/:orgId/members/:memberId/status')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  @ApiOperation({ summary: 'Ubah status aktif/nonaktif anggota' })
  async updateStatus(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberStatusDto,
  ) {
    return this.svc.updateStatus(Number(orgId), Number(memberId), body);
  }
}
