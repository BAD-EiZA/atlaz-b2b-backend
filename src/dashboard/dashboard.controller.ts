// src/b2b/dashboard/dashboard.controller.ts
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { GetDashboardSummaryDto, TestMode, TestModeEnum } from './dto/dashboard.dto';

@Controller('/b2b/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(':orgId')
  async getSummary(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query() query: GetDashboardSummaryDto,
  ) {
    console.log(query)
    const mode: TestMode = (query.testMode ?? TestModeEnum.ALL) as TestMode;

    const data = await this.dashboardService.getSummary(
      orgId,
      mode,
      query.startDate,
      query.endDate,
    );

    return {
      status: 'Success',
      message: 'Dashboard summary fetched successfully',
      data,
    };
  }
}
