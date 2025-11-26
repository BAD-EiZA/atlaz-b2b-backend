import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country_origin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() first_language?: string;
}
