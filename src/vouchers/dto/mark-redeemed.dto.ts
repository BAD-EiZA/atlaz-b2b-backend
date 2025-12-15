// src/b2b/vouchers/dto/mark-redeemed.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

export class MarkVoucherRedeemedDto {
  @ApiProperty()
  @IsInt()
  userId: number;

  @ApiProperty({ type: [String], example: ['A123', 'C999'] })
  @IsArray()
  @IsNotEmpty({ each: true })
  codes: string[];
}
