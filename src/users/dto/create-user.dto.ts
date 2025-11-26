import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @MaxLength(255) username: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;

  @ApiProperty({ example: 1 }) @IsInt() @Min(1) orgId: number; // untuk langsung dijadikan member org
  @ApiPropertyOptional({ example: 'User' }) @IsOptional() role?:
    | 'User'
    | 'Admin';
}
