import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Pool } from 'pg';
import { PG_POOL_TOKEN } from '../database/database.module';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(@Inject(PG_POOL_TOKEN) private readonly pool: Pool) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check with database connectivity' })
  async check() {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let dbLatencyMs = 0;

    try {
      const start = Date.now();
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbLatencyMs = Date.now() - start;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    const uptimeMs = Date.now() - this.startTime;
    const status = dbStatus === 'connected' ? 'healthy' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptimeMs / 1000)}s`,
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: dbStatus,
        latency: `${dbLatencyMs}ms`,
        type: 'postgresql',
      },
    };
  }
}
