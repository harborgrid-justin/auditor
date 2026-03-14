# AuditPro - Enterprise Audit Management System

Financial compliance platform covering GAAP, SOX, PCAOB, IRS, and DoD FMR.
Full-stack monorepo: Next.js 14 frontend + NestJS 10 backend, TypeScript throughout.

@docs/ARCHITECTURE.md
@docs/DOMAIN-GLOSSARY.md

## Quick Reference

| Task           | Command                                |
|----------------|----------------------------------------|
| Dev (frontend) | `npm run dev` (port 3000)              |
| Dev (backend)  | `cd server && npm run start:dev` (port 4000) |
| Lint           | `npm run lint`                         |
| Typecheck      | `npx tsc --noEmit`                    |
| Test frontend  | `npm test`                             |
| Test backend   | `cd server && npm test`                |
| Test e2e       | `cd server && npm run test:e2e`        |
| Test coverage  | `npm run test:coverage`                |
| Build frontend | `npm run build`                        |
| Build backend  | `cd server && npm run build`           |
| DB generate    | `npm run db:generate`                  |
| DB push        | `npm run db:push`                      |
| DB migrate     | `npm run db:migrate`                   |
| Seed data      | `npm run seed`                         |
| DoD tests only | `npx vitest run src/lib/engine/rules/dod_fmr/` |
| Single test    | `npx vitest run path/to/test.test.ts`  |

## Path Aliases

- `@/*` maps to `./src/*` (frontend)

## Code Conventions

- **Strict TypeScript**: avoid `any`; use `unknown` + type narrowing
- **Zod** for all API input validation (`src/lib/validation/`)
- **Drizzle ORM**: SQLite for frontend (`src/lib/db/schema.ts`), PostgreSQL for backend (`src/lib/db/pg-schema.ts`)
- **NestJS pattern**: controller + service + DTO (see `server/src/dod/contracts/` for reference)
- **Engine modules**: pure functions, no side effects, JSDoc with regulatory references
- **UI**: shadcn/ui primitives in `src/components/ui/`, use `cn()` helper, Tailwind only
- **State management**: Zustand stores (not React context for global state)
- **Frontend tests**: Vitest, collocated in `__tests__/` dirs (`src/**/__tests__/**/*.test.ts`)
- **Backend tests**: Jest (`server/src/**/*.spec.ts`)

## Verification Checklist

IMPORTANT: Before considering any task complete, run these in order:
1. `npm run lint` -- passes with no new warnings
2. `npx tsc --noEmit` -- no type errors
3. `npx vitest run` -- relevant frontend tests pass
4. If backend changed: `cd server && npm run build && npm test`

## Critical Domain Rules

- **Never hardcode** tax rates, materiality thresholds, or regulatory parameters -- use engine modules
- **Rule versioning is immutable**: never mutate existing rule versions; create new versions via `src/lib/engine/rules/rule-versioning.ts`
- **Separation of duties**: respect SoD constraints in `src/lib/security/separation-of-duties.ts`
- **Data classification**: all DoD data must carry a classification level (unclassified, CUI, CUI_specified, FOUO)
- **Financial calculations**: use integer cents or Decimal -- NEVER floating-point for currency
- **Regulatory references**: every engine rule must cite specific regulation (DoD FMR volume/chapter, USC section, CFR part)
- **Federal report formats**: SF-132, SF-133, DD-1414, DD-2657, GTAS, SBR field names must match Treasury/DoD specs exactly

## Security Requirements

- Never log sensitive financial data (account numbers, SSNs, payment amounts)
- Never commit secrets, tokens, or passwords -- use environment variables
- All API endpoints require authentication (NextAuth frontend, Passport JWT backend)
- Backend role guards: use `@Roles()` decorator from `server/src/common/decorators/roles.decorator.ts`
- Security headers in `next.config.mjs` must not be weakened
- FIPS-approved cryptographic algorithms only in `src/lib/security/fips-mode.ts`

## Environment

- Node 20, Docker with docker-compose (postgres:16-alpine, redis:7-alpine)
- Frontend env: `.env.local` (NEXTAUTH_SECRET, etc.)
- Backend env: docker-compose or `.env` (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, REDIS_HOST, REDIS_PORT)

## When Compacting

When compacting, always preserve: the verification checklist, critical domain rules, and the list of modified files.
