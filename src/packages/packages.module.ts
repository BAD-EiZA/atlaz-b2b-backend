// src/b2b/packages/org-packages.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrgPackagesController } from './packages.controller';
import { OrgPackagesService } from './packages.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrgPackagesController],
  providers: [OrgPackagesService],
  exports: [OrgPackagesService],
})
export class OrgPackagesModule {}
