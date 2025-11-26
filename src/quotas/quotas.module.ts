import { Module } from '@nestjs/common';
import { QuotasController } from './quotas.controller';
import { QuotasService } from './quotas.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [QuotasController],
  providers: [QuotasService],
})
export class QuotasModule {}
