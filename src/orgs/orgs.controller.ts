import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgsService } from './orgs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgMemberGuard } from '../auth/org-member.guard';
import { OrgAdminGuard } from '../auth/org-admin.guard';
import { UpdateOrgDto } from './dto/update-org.dto';

@ApiTags('Orgs')
@Controller('b2b/orgs/:orgId')
export class OrgsController {
  constructor(private readonly svc: OrgsService) {}

  @Get()
  @ApiOperation({ summary: 'Detail organisasi' })
  async get(@Param('orgId') orgId: string) {
    return this.svc.get(Number(orgId));
  }

  // @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @Patch()
  @ApiOperation({ summary: 'Update nama & logo organisasi' })
  async update(@Param('orgId') orgId: string, @Body() dto: UpdateOrgDto) {
    return this.svc.update(Number(orgId), dto);
  }
}
