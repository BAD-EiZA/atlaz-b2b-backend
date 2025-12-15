// src/b2b/vouchers/dto/apply-voucher.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { voucer_test_type, voucher_platform_type } from '@prisma/client';

export class ApplyVoucherDto {
  @ApiProperty()
  @IsInt()
  userId: number;

  @ApiProperty({ type: [String], example: ['A123', 'C999'] })
  @IsArray()
  @IsNotEmpty({ each: true })
  codes: string[];

  @ApiProperty({ example: 149000 })
  @IsNumber()
  @IsPositive()
  baseAmount: number;

  @ApiProperty({
    enum: voucher_platform_type,
    default: voucher_platform_type.B2B,
  })
  @IsEnum(voucher_platform_type)
  platform_type: voucher_platform_type = voucher_platform_type.B2B;

  @ApiProperty({ enum: voucer_test_type, example: voucer_test_type.IELTS })
  @IsEnum(voucer_test_type)
  test_type: voucer_test_type;
}
