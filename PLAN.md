# Enterprise Features Audit — Production Readiness Plan

## Executive Summary

After thorough analysis of 276 frontend and 128 backend source files, 29+29 test files, 48 API routes, 27 backend DoD modules, and all infrastructure — here are the critical enterprise gaps organized by severity and domain.

---

## 1. CRITICAL: Financial Data Integrity — `DOUBLE PRECISION` for Currency

**Problem**: `pg-schema.ts` uses `DOUBLE PRECISION` for 22 monetary columns (amounts, balances, disbursements). This violates IEEE 754 — `0.1 + 0.2 !== 0.3` — and the CLAUDE.md rule: "use integer cents or Decimal — NEVER floating-point for currency."

**Files**: `src/lib/db/pg-schema.ts` (all `DOUBLE PRECISION` monetary columns)

**Fix**: Change all monetary columns to `NUMERIC(18,2)` (or `BIGINT` for cents). Update all services that read/write these columns to use string-based decimal arithmetic or integer cents.

**Affected tables**: `engagements`, `findings`, `interagency_agreements`, `working_capital_funds`, `special_accounts`, `reprogramming_actions`, `monitoring_alert_configs`, `monitoring_alerts`, `three_way_matches`, `suspense_items`.

---

## 2. CRITICAL: Audit Trail Uses `console.log` Instead of Database

**Problem**: `server/src/common/interceptors/audit-trail.interceptor.ts` logs audit events with `console.log('[AUDIT]', ...)` — a comment says "Will be replaced with database insert once DatabaseModule is wired." For a financial compliance platform, audit trails MUST be immutable and persisted in the database.

**Files**: `server/src/common/interceptors/audit-trail.interceptor.ts`

**Fix**: Wire the interceptor to insert into the `audit_logs` PostgreSQL table via Drizzle ORM. Remove the `console.log` fallback.

---

## 3. CRITICAL: CAC/PIV Certificate Revocation Not Implemented

**Problem**: `server/src/auth/cac-piv.strategy.ts` has 5 TODO comments for missing CRL/OCSP checking. Without revocation checking, revoked certificates would still authenticate.

**Files**: `server/src/auth/cac-piv.strategy.ts`

**Fix**: Implement CRL download/caching from DISA distribution points, and OCSP responder requests. Add periodic CRL refresh job.

---

## 4. CRITICAL: Backup Manager Has Stubbed File I/O

**Problem**: `src/lib/security/backup-manager.ts` has TODO comments where actual file writes and reads are commented out for production. Encrypted backup/restore is not functional.

**Files**: `src/lib/security/backup-manager.ts`

**Fix**: Implement the actual `fs.promises.writeFile` / `fs.readFileSync` calls with proper permissions (`0o600`), and implement `pg_dump`/`pg_basebackup` invocation.

---

## 5. HIGH: 16 Backend Modules Have No Frontend API Routes

**Problem**: The backend has 27 DoD modules, but only 11 have corresponding Next.js API routes. 16 modules are inaccessible from the frontend:

- `batch`, `budget-formulation`, `debt-management`, `evidence`, `financial-statements`
- `igt-reconciliation`, `leases`, `monitoring`, `organizations`, `pay-tables`
- `reconciliation`, `reimbursable`, `remediation`, `security-cooperation`
- `special-accounts`, `workflows`

**Fix**: Create frontend API route handlers for each missing module, following the existing patterns in `src/app/api/dod/`.

---

## 6. HIGH: Middleware Auth Coverage Is Incomplete

**Problem**: `src/middleware.ts` protects 10 route prefixes but misses:
- `/api/dod/*` — All DoD endpoints are unprotected by the Next.js middleware
- `/api/health` — Intentionally public, fine
- `/api/legislation` — Unprotected
- `/api/tax-parameters/*` — Unprotected

**Fix**: Add `/api/dod/:path*`, `/api/legislation/:path*`, `/api/tax-parameters/:path*` to the middleware matcher.

---

## 7. HIGH: `console.log` in Server Code (Should Use Winston)

**Problem**: 4 server files use `console.log`/`console.error` instead of the Winston logger:
- `server/src/common/telemetry/alerting.ts`
- `server/src/common/telemetry/opentelemetry.ts`
- `server/src/common/filters/http-exception.filter.ts`
- `server/src/common/interceptors/audit-trail.interceptor.ts`

**Fix**: Replace all `console.*` calls with injected Winston logger.

---

## 8. HIGH: TypeScript `any` Types Throughout Codebase

**Problem**: 5 frontend lib files and 25 backend files use `: any` types, violating the "Strict TypeScript: avoid `any`; use `unknown` + type narrowing" rule.

**Fix**: Audit and replace all `any` with proper types or `unknown` + type guards.

---

## 9. HIGH: In-Memory Rate Limiter Won't Scale

**Problem**: `src/lib/middleware/rate-limit.ts` uses an in-memory `Map` for rate limiting. In a multi-instance deployment (Kubernetes/Docker), each instance has its own store — rate limits aren't shared.

**Fix**: Replace with Redis-backed rate limiter using the existing Redis infrastructure, or use a NestJS `@nestjs/throttler` with Redis store on the backend.

---

## 10. HIGH: Test Coverage Is Low

**Problem**: 29 frontend tests for 276 source files (~10.5% file coverage). 29 backend tests for 128 source files (~22.7% file coverage). Many critical engine modules have zero tests:
- No tests for: `comparative-analysis`, `journal-entry-testing`, `ratio-analysis`, `trend-analysis`, `variance-analysis`, `contract-payments`, `travel-compliance`, `reimbursable-ops`, `consolidation`, `appropriation-lifecycle`, `budget-formulation`, and many more federal accounting modules.
- No tests for any GAAP, IRS, SOX, or PCAOB rules.
- No tests for integrations (DFAS, QuickBooks, Xero, SAM, Treasury, USASpending, G-Invoicing, DNP).
- No tests for security modules (encryption, FIPS, SoD, data-classification).

**Fix**: Add comprehensive test suites for all untested modules, prioritizing engine rules and security modules.

---

## 11. HIGH: Missing Frontend UI Pages for Key Modules

**Problem**: Only 23 pages exist. Missing UI for:
- Monitoring dashboard (alerts, metrics)
- Batch operations management
- Workflow management
- Evidence package viewer
- Reconciliation dashboard
- Organization hierarchy management
- Lease management
- Debt management
- Security cooperation
- Special accounts
- User/role administration
- Settings/configuration

**Fix**: Build these pages using existing shadcn/ui components and Zustand stores.

---

## 12. MEDIUM: No SAML/SSO Integration

**Problem**: `server/src/auth/` has JWT and CAC/PIV strategies but no SAML strategy file exists despite ARCHITECTURE.md mentioning "Passport JWT + SAML authentication."

**Fix**: Implement SAML 2.0 strategy using `passport-saml` for enterprise SSO integration.

---

## 13. MEDIUM: No Multi-Tenancy Isolation

**Problem**: `pg-schema.ts` has no `organization_id` or `tenant_id` on most tables. Only `organizations` table exists but isn't used as a tenant boundary. Enterprise deployments need data isolation per organization/component.

**Fix**: Add `organization_id` foreign key to engagement-level tables and enforce row-level filtering in all services.

---

## 14. MEDIUM: No Internationalization (i18n)

**Problem**: Zero i18n infrastructure. No locale files, no translation framework. Federal/DoD systems may need multi-language support for coalition partners and international financial reporting.

**Fix**: Implement `next-intl` or `react-intl` with English as default, with locale message extraction.

---

## 15. MEDIUM: No WebSocket/Real-Time Updates

**Problem**: No real-time notification system. Users must refresh to see updates from batch jobs, workflow approvals, monitoring alerts. The escalation service exists but has no delivery mechanism.

**Fix**: Add NestJS WebSocket Gateway for real-time event push (workflow status, alerts, batch progress).

---

## 16. MEDIUM: No Zustand Stores for State Management

**Problem**: No Zustand stores found despite CLAUDE.md specifying "Zustand stores (not React context for global state)."

**Fix**: Create Zustand stores for: engagement state, user session, notification queue, DoD module state, and UI preferences.

---

## 17. MEDIUM: Validation Schema Coverage Is Minimal

**Problem**: Only 1 validation schema file (`src/lib/validation/schemas.ts`) for 48 API routes. Most DoD API routes likely lack Zod input validation.

**Fix**: Create Zod schemas for every API endpoint input, matching the DTO patterns on the backend side.

---

## 18. LOW: No Data Retention/Archival Policy Implementation

**Problem**: Schema has `archived_at` and `retention_until` columns on `engagements` but no automated enforcement — no scheduled job purges expired data or enforces retention policies.

**Fix**: Add a scheduled job to enforce data retention policies (archive, purge, legal hold).

---

## 19. LOW: Health Check Is Shallow

**Problem**: `server/src/health/health.controller.ts` is 49 lines — likely only checks if the server responds, not database connectivity, Redis connectivity, or disk space.

**Fix**: Implement deep health checks: PostgreSQL ping, Redis ping, disk space, memory usage, pending job queue depth.

---

## 20. LOW: Missing `.env.example` Templates

**Problem**: No `.env.example` or `.env.local.example` files to document required environment variables.

**Fix**: Create `.env.example` files for both frontend and backend with all required variables documented.

---

## Implementation Priority Order

### Phase 1 — Data Integrity & Security (Critical)
1. Fix `DOUBLE PRECISION` → `NUMERIC(18,2)` for all monetary columns
2. Wire audit trail interceptor to database
3. Implement CAC/PIV CRL/OCSP checking
4. Fix backup manager file I/O stubs
5. Fix auth middleware to cover all DoD/legislation/tax-parameters routes

### Phase 2 — API & Backend Completeness (High)
6. Create 16 missing frontend API routes for backend DoD modules
7. Replace `console.log` with Winston logger in server code
8. Remove all `any` types (30 files)
9. Replace in-memory rate limiter with Redis-backed
10. Add Zod validation schemas for all API endpoints

### Phase 3 — Testing & Quality (High)
11. Add tests for all untested engine modules
12. Add tests for security modules
13. Add integration tests for external system adapters

### Phase 4 — Enterprise Features (Medium)
14. Implement SAML/SSO strategy
15. Add multi-tenancy with organization-based data isolation
16. Build missing frontend pages (12+ pages)
17. Add WebSocket gateway for real-time updates
18. Create Zustand stores for state management
19. Implement i18n framework

### Phase 5 — Operations (Low)
20. Implement deep health checks
21. Add data retention job
22. Create `.env.example` files
23. Redis-backed session store for horizontal scaling
