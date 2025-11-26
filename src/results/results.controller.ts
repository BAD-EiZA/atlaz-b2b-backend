import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ResultsService } from './results.service';
import { ListResultsDto } from './dto/list-results.dto';
// Ganti dengan decorator/guard milikmu untuk ambil orgId dari JWT

@Controller('/b2b/results')
export class ResultsController {
  constructor(private readonly service: ResultsService) {}

  @Get('ielts/:orgId')
  listIelts(@Param('orgId') orgId: number, @Query() dto: ListResultsDto) {
    return this.service.listIelts(orgId, dto);
  }

  @Get('toefl/:orgId')
  listToefl(@Param('orgId') orgId: number, @Query() dto: ListResultsDto) {
    return this.service.listToefl(orgId, dto);
  }

  @Get('ielts/history/:userId')
  historyIelts(
     orgId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.historyIelts(orgId, userId);
  }

  @Get('toefl/history/:userId')
  historyToefl(
     orgId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.historyToefl(orgId, userId);
  }
}
