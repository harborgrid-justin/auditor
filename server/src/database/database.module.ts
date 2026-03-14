import { Module, Global, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/lib/db/pg-schema';

export const DATABASE_TOKEN = 'DATABASE_CONNECTION';
export const PG_POOL_TOKEN = 'PG_POOL';

/** Typed Drizzle database instance with full schema awareness. */
export type AppDatabase = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL_TOKEN,
      useFactory: (config: ConfigService) => {
        return new Pool({
          host: config.get('DB_HOST', 'localhost'),
          port: config.get('DB_PORT', 5432),
          database: config.get('DB_NAME', 'auditpro'),
          user: config.get('DB_USER', 'auditpro'),
          password: config.get('DB_PASSWORD', 'auditpro'),
          max: config.get('DB_POOL_SIZE', 20),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_TOKEN,
      useFactory: (pool: Pool) => {
        return drizzle(pool, { schema });
      },
      inject: [PG_POOL_TOKEN],
    },
  ],
  exports: [DATABASE_TOKEN, PG_POOL_TOKEN],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(PG_POOL_TOKEN) private readonly pool: Pool,
  ) {}

  async onModuleInit() {
    const host = this.configService.get('DB_HOST', 'localhost');
    const db = this.configService.get('DB_NAME', 'auditpro');
    this.logger.log(`PostgreSQL connection configured: ${host}/${db}`);
  }

  async onModuleDestroy() {
    this.logger.log('Closing PostgreSQL connection pool...');
    await this.pool.end();
    this.logger.log('PostgreSQL connection pool closed');
  }
}
