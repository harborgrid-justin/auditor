---
paths:
  - "src/app/api/**"
---

# Next.js API Route Rules

- Every route must validate input using Zod schemas from `src/lib/validation/`
- Return consistent JSON shape: `{ data }` on success, `{ error: string }` on failure
- Use appropriate HTTP status codes (201 for creation, 400 for validation, 401/403 for auth)
- Import auth session check from `src/lib/auth/` -- never expose unauthenticated endpoints (except `/api/health`)
- Wrap handler logic in try/catch; never let unhandled exceptions leak to client
- DoD API routes (`src/app/api/dod/*`) must check data classification level before returning data
