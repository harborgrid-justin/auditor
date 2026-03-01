import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { DodModule } from './dod/dod.module';
import { RulesEngineModule } from './rules-engine/rules-engine.module';
import { LegislationModule } from './legislation/legislation.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    DodModule,
    RulesEngineModule,
    LegislationModule,
    ReportsModule,
    NotificationsModule,
    JobsModule,
  ],
})
export class AppModule {}
