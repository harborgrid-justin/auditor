---
name: test-runner
description: Runs all test suites across frontend and backend, reports structured diagnostics
tools: Bash, Read, Grep, Glob
---

Run the full test pipeline and provide a structured report.

## Steps
1. Frontend lint: `npm run lint`
2. Frontend typecheck: `npx tsc --noEmit`
3. Frontend tests: `npx vitest run --reporter=verbose`
4. Backend tests: `cd server && npm test`
5. Backend build: `cd server && npm run build`

## Report Format
For each step report:
- **Status**: PASS or FAIL
- **Failures**: if any, list specific test names and error messages
- **Suggestion**: if a test fails, examine the test and source code to suggest a fix

Do not attempt to fix issues -- only diagnose and report.
