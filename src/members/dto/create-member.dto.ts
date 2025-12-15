// dto/create-member.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsEmail,
  IsString,
  IsDateString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { B2bRole } from '../../shared/constants';

export enum B2bTestName {
  IELTS = 'IELTS',
  TOEFL = 'TOEFL',
}

// 1 skill quota
export class QuotaInputDto {
  @ApiProperty({
    enum: B2bTestName,
    example: B2bTestName.IELTS,
    description: 'Jenis tes: IELTS atau TOEFL',
  })
  @IsEnum(B2bTestName)
  test_name: B2bTestName;

  @ApiProperty({
    example: 1,
    description: 'ID tipe tes (mis: ielts_m_type.id / toefl_m_type.id)',
  })
  @IsInt()
  @Min(1)
  test_type_id: number;

  @ApiProperty({
    example: 5,
    description: 'Jumlah attempt / kuota untuk skill ini',
  })
  @IsInt()
  @Min(1)
  quota: number;
}

export class CreateMemberDto {
  // ---------- DATA USER BARU (WAJIB) ----------

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'janedoe123' })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'Secret123!',
    required: false,
    description: 'Password optional, bisa di-generate otomatis di backend',
  })
  @IsOptional()
  @IsString()
  password?: string;

  // ---------- PROFIL USER (BARU) ----------

  @ApiProperty({
    example: 'Malaysia',
    required: false,
  })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiProperty({
    example: 'Indonesia',
    required: false,
  })
  @IsOptional()
  @IsString()
  country_origin?: string;

  @ApiProperty({
    example: 'Indonesian',
    required: false,
  })
  @IsOptional()
  @IsString()
  first_language?: string;

  // ---------- INFO KUOTA (BARU: MULTI SKILL) ----------

  @ApiProperty({
    type: [QuotaInputDto],
    description: 'Daftar kuota per skill (boleh IELTS & TOEFL campur)',
  })
  @ValidateNested({ each: true })
  @Type(() => QuotaInputDto)
  @ArrayMinSize(1)
  quotas: QuotaInputDto[];

  @ApiProperty({
    example: 'IDR',
    required: false,
    description: 'Mata uang kuota, default IDR kalau tidak diisi',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: '0827774522',
    required: false,
    description: 'Nomor Hp User',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '2026-12-31',
    required: false,
    description: 'Tanggal expired kuota (opsional, berlaku untuk semua skill)',
  })
  @IsOptional()
  @IsDateString()
  expired_date?: string;
}
