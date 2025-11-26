import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('/b2b/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(':orgId')
  async getDashboard(
    @Param('orgId', ParseIntPipe) orgId: number,
  ) {
    // kalau mau, di sini bisa ditambah check akses user ke orgId tsb
    return this.dashboardService.getSummary(orgId);
  }
}
