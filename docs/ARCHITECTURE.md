## Architecture

### Frontend (Next.js 14 App Router)
- `src/app/` -- Pages and API route handlers
- `src/app/api/` -- REST endpoints (analyze, audit-log, auth, dod/*, engagements, export, findings, health, legislation, portal, schedules, signoffs, tax-parameters, templates, upload, workpapers)
- `src/components/` -- React components (`layout/` for chrome, `ui/` for primitives)
- `src/lib/engine/` -- Core business logic (22 modules), pure functions, no framework deps
- `src/lib/integrations/` -- External system adapters (DFAS, QuickBooks, Xero, SAM, Treasury, USASpending, G-Invoicing, DNP)
- `src/lib/reports/` -- Federal financial statement generators (SF-132, SF-133, DD-1414, DD-2657, GTAS, SBR, RSI)
- `src/lib/security/` -- NIST 800-53, FIPS, SoD, data classification, encryption
- `src/lib/validation/` -- Zod schemas for all API inputs
- `src/types/` -- Shared TypeScript types (dod-fmr.ts, findings.ts, financial.ts, sox.ts, tax-compliance.ts, engagement.ts)
- Auth: NextAuth with credentials provider, session stored in SQLite

### Backend (NestJS 10)
- `server/src/dod/` -- 29 DoD-specific modules (contracts, civilian-pay, military-pay, travel, obligations, disbursements, appropriations, fund-control, leases, debt-management, financial-statements, ussgl, igt-reconciliation, security-cooperation, special-accounts, reimbursable, batch, monitoring, remediation, workflows, etc.)
- `server/src/auth/` -- Passport JWT + SAML authentication
- `server/src/database/` -- Drizzle ORM PostgreSQL connection
- `server/src/jobs/` -- BullMQ job queue processors
- `server/src/rules-engine/` -- Server-side rule execution
- `server/src/common/` -- Guards, decorators, interceptors, filters, logging (Winston), telemetry

### Data Layer
- SQLite: frontend local data, schema at `src/lib/db/schema.ts`
- PostgreSQL 16: production backend, schema at `src/lib/db/pg-schema.ts`
- Redis 7: BullMQ job queue
- Migrations: `drizzle/` directory, managed by drizzle-kit

### Infrastructure
- Docker: Node 20 Alpine, `docker-compose.yml` orchestrates frontend + api + postgres + redis
- CI: GitHub Actions (`.github/workflows/ci.yml`) -- lint, typecheck, test, build, DoD rule tests, DB migration check, Docker build
