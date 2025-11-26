import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { B2bRole } from '../../shared/constants';

export class ListMembersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ enum: B2bRole })
  @IsOptional()
  @IsEnum(B2bRole)
  role?: B2bRole;
  @ApiPropertyOptional({ description: 'true/false' })
  @IsOptional()
  @IsBooleanString()
  status?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
