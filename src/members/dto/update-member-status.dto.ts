import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
export class UpdateMemberStatusDto {
  @ApiProperty({ example: true }) @IsBoolean() status: boolean;
}
