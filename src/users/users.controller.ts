import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAdminGuard } from '../auth/org-admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OrgMemberGuard } from '../auth/org-member.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @Post('b2b/orgs/:orgId/users')
  @ApiOperation({ summary: 'Registrasi siswa (single) + auto-member org' })
  async create(@Param('orgId') orgId: string, @Body() body: CreateUserDto) {
    return this.svc.create({ ...body, orgId: Number(orgId) });
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Update data user' })
  async update(@Param('userId') userId: string, @Body() body: UpdateUserDto) {
    return this.svc.update(Number(userId), body);
  }

  @Patch('users/:userId/profile')
  @ApiOperation({ summary: 'Update profil user (user_profiles)' })
  async updateProfile(
    @Param('userId') userId: string,
    @Body() body: UpdateProfileDto,
  ) {
    return this.svc.updateProfile(Number(userId), body);
  }
}
