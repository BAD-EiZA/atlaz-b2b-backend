import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserHistoryQueryDto } from './dto/user-history.query.dto';

@ApiTags('Report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('report/user/:userId')
export class ReportController {
  constructor(private readonly svc: ReportService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Ringkasan skor terbaru user (IELTS/TOEFL)' })
  async summary(@Param('userId') userId: string) {
    return this.svc.summary(Number(userId));
  }

  @Get('history')
  @ApiOperation({ summary: 'Histori skor user (IELTS/TOEFL)' })
  async history(
    @Param('userId') userId: string,
    @Query() q: UserHistoryQueryDto,
  ) {
    return this.svc.history(Number(userId), q.page, q.pageSize);
  }
}
