---
name: add-dod-module
description: Scaffold a new DoD FMR compliance module (engine + backend + API + tests)
---

Scaffold a new DoD module: $ARGUMENTS

## Frontend Engine Module
1. Create `src/lib/engine/$ARGUMENTS/` directory
2. Create main module file with:
   - JSDoc header citing DoD FMR volume/chapter
   - TypeScript interfaces for inputs and outputs
   - Pure function implementations
   - Exported analyze/evaluate function
3. Create `src/lib/engine/$ARGUMENTS/__tests__/$ARGUMENTS.test.ts`
4. Add types to `src/types/dod-fmr.ts` if needed

## Backend NestJS Module
1. Create `server/src/dod/$ARGUMENTS/` directory
2. Create files following the contracts module pattern (`server/src/dod/contracts/`):
   - `$ARGUMENTS.controller.ts` -- with Swagger decorators, @Roles guards
   - `$ARGUMENTS.service.ts` -- business logic, Drizzle queries
   - `$ARGUMENTS.dto.ts` -- class-validator DTOs
   - `$ARGUMENTS.module.ts` -- NestJS module registration
3. Register module in the DoD parent module

## API Route (if frontend-facing)
1. Create `src/app/api/dod/$ARGUMENTS/route.ts`
2. Add Zod schema to `src/lib/validation/`
3. Add auth check and input validation

## Verification
- `npx vitest run src/lib/engine/$ARGUMENTS/`
- `cd server && npm test`
- `npm run lint && npx tsc --noEmit`
