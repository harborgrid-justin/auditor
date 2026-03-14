---
name: add-api-route
description: Add a new Next.js API route with Zod validation and auth
---

Add a new API route: $ARGUMENTS

1. Determine the route path and HTTP methods needed
2. Add Zod validation schema to `src/lib/validation/`
3. Create route handler at `src/app/api/$ARGUMENTS/route.ts`:
   - Import and check auth session from `src/lib/auth/`
   - Parse and validate request body with Zod schema
   - Call service/engine logic
   - Return `{ data }` on success, `{ error }` on failure with correct status codes
   - Wrap in try/catch
4. If the route needs a corresponding backend endpoint, create NestJS controller/service following the pattern in `server/src/dod/contracts/`
5. Add test coverage
6. Verify: `npm run lint && npx tsc --noEmit && npx vitest run`
