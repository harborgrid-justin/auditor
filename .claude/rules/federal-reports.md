---
paths:
  - "src/lib/reports/**"
---

# Federal Report Generation Rules

- Report generators produce structured data matching exact federal form specifications
- SF-132, SF-133, DD-1414, DD-2657, GTAS, SBR formats are defined by Treasury/DoD -- field names and structures must match exactly
- Every report generator must have tests in its `__tests__/` directory
- Financial amounts must balance: debits = credits, assets = liabilities + net position
- Include reconciliation checks within report generation -- flag discrepancies rather than silently produce incorrect reports
- Run report tests: `npx vitest run src/lib/reports/`
