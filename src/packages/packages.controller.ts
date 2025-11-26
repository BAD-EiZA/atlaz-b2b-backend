// src/b2b/packages/org-packages.controller.ts
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { OrgPackagesService } from './packages.service';
import { OrgPackagesQueryDto } from './dto/packages-query.dto';

@Controller('/b2b/orgs/:orgId/packages')
export class OrgPackagesController {
  constructor(private readonly orgPackagesService: OrgPackagesService) {}

  @Get()
  async list(
    @Param('orgId', ParseIntPipe) orgId: number, // disiapkan kalau nanti mau ada logic per org
    @Query() query: OrgPackagesQueryDto,
  ) {
    // sementara orgId belum dipakai di service,
    // tapi pattern path sudah konsisten dengan /orgs/:orgId/...
    return this.orgPackagesService.listAvailable(query);
  }
}
