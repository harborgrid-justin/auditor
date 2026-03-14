---
name: fix-issue
description: Diagnose and fix a GitHub issue end-to-end
---

Analyze and fix the GitHub issue: $ARGUMENTS

1. Read the issue: `gh issue view $ARGUMENTS`
2. Understand the scope: identify which area is affected (engine, API, UI, backend, integration)
3. Find the relevant source files using grep and glob
4. Read related test files to understand expected behavior
5. Implement the fix following the path-specific rules for the affected area
6. Write or update tests to cover the fix
7. Run verification:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npx vitest run` (affected test files)
   - If backend: `cd server && npm test`
8. Commit with message: `fix: <description> (closes #$ARGUMENTS)`
9. Push and create a PR with `gh pr create`
