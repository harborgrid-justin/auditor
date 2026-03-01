import { NextResponse } from 'next/server';
import { rawDb } from '@/lib/db';

const startTime = Date.now();

export async function GET() {
  try {
    // Test database connectivity
    const dbResult = rawDb.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
    const dbHealthy = dbResult?.ok === 1;

    return NextResponse.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      database: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        database: 'error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
