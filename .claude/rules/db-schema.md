---
paths:
  - "src/lib/db/**"
  - "server/src/database/**"
  - "drizzle/**"
  - "drizzle.config.ts"
  - "server/drizzle.config.ts"
---

# Database Schema Rules

- Frontend SQLite schema: `src/lib/db/schema.ts` -- uses `sqliteTable` from drizzle-orm
- Backend PostgreSQL schema: `src/lib/db/pg-schema.ts` -- uses `pgTable` from drizzle-orm
- All tables must have an `id` primary key (text/uuid)
- Use `text` type for dates (ISO 8601 strings) in SQLite; use `timestamp` in PostgreSQL
- Foreign keys must reference existing tables with `.references()`
- After schema changes: run `npm run db:generate` then `npm run db:push`
- Never delete or rename columns in production migrations -- add new columns and deprecate old ones
- Enum values in SQLite use `text` with check constraint; in PostgreSQL use `pgEnum`
