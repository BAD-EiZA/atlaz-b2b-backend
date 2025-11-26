import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import * as constants from '../../shared/constants';

export class CreateDraftDto {
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) orgId: number;
  @ApiProperty({ example: 10 }) @IsInt() @Min(1) packageId: number;

  @ApiProperty({ example: 'order-1731312345678' })
  @IsString()
  @Matches(/^[A-Za-z0-9_\-\.]{6,64}$/)
  externalId: string;

  @ApiProperty({ enum: constants.ALLOWED_CURRENCIES })
  @IsEnum(constants.ALLOWED_CURRENCIES)
  currency: constants.Currency;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: constants.ALLOWED_METHODS })
  @IsEnum(constants.ALLOWED_METHODS)
  method: constants.PayMethod;

  @ApiProperty({ example: 'BCA' }) @IsString() channel: string;

  @ApiProperty({ example: 123, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}
