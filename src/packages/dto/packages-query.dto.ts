// src/b2b/packages/dto/org-packages-query.dto.ts
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class OrgPackagesQueryDto {
  @IsOptional()
  @IsIn(['IELTS', 'TOEFL'])
  test_category?: 'IELTS' | 'TOEFL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  test_type_id?: number;
}
