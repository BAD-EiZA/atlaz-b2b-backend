import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OrgsController],
  providers: [OrgsService],
})
export class OrgsModule {}
