import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import * as constants from '../../shared/constants';

export class PaymentHistoryQueryDto {
  @ApiPropertyOptional({ example: 1 }) @IsInt() @Min(1) orgId: number;
  @ApiPropertyOptional({ description: 'PAID/PENDING/FAILED/...' })
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional({ enum: constants.ALLOWED_METHODS })
  @IsOptional()
  @IsEnum(constants.ALLOWED_METHODS)
  method?: constants.PayMethod;
  @ApiPropertyOptional({ example: 'BCA' })
  @IsOptional()
  @IsString()
  channel?: string;
  @ApiPropertyOptional({ enum: constants.ALLOWED_CURRENCIES })
  @IsOptional()
  @IsEnum(constants.ALLOWED_CURRENCIES)
  currency?: constants.Currency;
  @ApiPropertyOptional({ example: 'order-17313...' })
  @IsOptional()
  @IsString()
  externalId?: string;
  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsISO8601()
  date_from?: string;
  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsISO8601()
  date_to?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
