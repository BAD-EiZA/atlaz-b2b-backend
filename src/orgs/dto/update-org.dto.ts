import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: 'Atlaz Academy' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logo?: string; // gunakan presigned URL flow di service upload
}
