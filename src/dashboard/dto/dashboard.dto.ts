// src/b2b/dashboard/dashboard.dto.ts
import { IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum TestModeEnum {
  ALL = 'all',
  COMPLETE_ONLY = 'complete-only',
  SECTION_ONLY = 'section-only',
}

export type TestMode = 'all' | 'complete-only' | 'section-only';

export class GetDashboardSummaryDto {
  @IsOptional()
  @IsEnum(TestModeEnum)
  testMode?: TestModeEnum;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
