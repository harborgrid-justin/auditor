---
name: run-compliance-tests
description: Run the full DoD/federal compliance test suite and report results
disable-model-invocation: true
---

Run all compliance-critical test suites and report pass/fail status:

1. DoD FMR Rule Tests: `npx vitest run src/lib/engine/rules/dod_fmr/ --reporter=verbose`
2. Federal Accounting Tests: `npx vitest run src/lib/engine/federal-accounting/ --reporter=verbose`
3. DoD Parameter Tests: `npx vitest run src/lib/engine/tax-parameters/ --reporter=verbose`
4. Federal Report Tests: `npx vitest run src/lib/reports/ --reporter=verbose`
5. Security Module Tests: `npx vitest run src/lib/security/ --reporter=verbose`

Report each suite with PASS/FAIL status and any failing test names.
