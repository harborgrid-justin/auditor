import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { DodModule } from './dod/dod.module';
import { RulesEngineModule } from './rules-engine/rules-engine.module';
import { LegislationModule } from './legislation/legislation.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
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
  providers: [
    // Global rate limiting — 100 requests/minute default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global JWT authentication — all routes protected unless @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
    // Global role-based access control — enforces @Roles() decorators
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
