import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { MembersModule } from './members/members.module';
import { PaymentsModule } from './payments/payments.module';
import { QuotasModule } from './quotas/quotas.module';
import { ReportModule } from './report/report.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OrgPackagesModule } from './packages/packages.module';
import { ResultsModule } from './results/results.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrgsModule,
    MembersModule,
    PaymentsModule,
    QuotasModule,
    ReportModule,
    UsersModule,
    DashboardModule,
    OrgPackagesModule,
    ResultsModule
  ],
})
export class AppModule {}
