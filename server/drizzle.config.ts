import type { Config } from 'drizzle-kit';

export default {
  schema: '../src/lib/db/pg-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'auditpro',
    user: process.env.DB_USER || 'auditpro',
    password: process.env.DB_PASSWORD || 'auditpro-secure-password',
  },
} satisfies Config;
