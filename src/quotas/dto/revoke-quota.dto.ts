import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { TestKind } from './test-kind.enum';

export class RevokeQuotaDto {
  @ApiProperty({ example: 12 }) @IsInt() @Min(1) admin_id: number;
  @ApiProperty({ example: 345 }) @IsInt() @Min(1) user_id: number;
  @ApiProperty({ enum: TestKind }) @IsEnum(TestKind) test: TestKind;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) test_type_id: number;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) amount: number;
}
