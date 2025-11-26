// src/b2b/members/dto/bulk-create-members.dto.ts
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateMemberDto } from './create-member.dto';

export class BulkCreateMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  users: CreateMemberDto[];
}
