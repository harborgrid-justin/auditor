---
paths:
  - "src/lib/engine/**"
---

# Engine Module Rules

These are the core audit decision engines. They must be:
- **Pure functions**: no database calls, no network I/O, no framework dependencies
- **Deterministic**: same input always produces same output
- **Fully documented**: every exported function needs JSDoc with regulatory reference citations (DoD FMR volume/chapter, USC section, FASAB standard)
- **Immutable rule history**: never modify existing rule versions; use `rule-versioning.ts` to create new versions

Testing requirements:
- Every engine module must have a `__tests__/` directory with comprehensive tests
- Test edge cases: zero values, negative amounts, boundary conditions at materiality thresholds
- DoD FMR tests run separately in CI (`dod-rule-tests` job) and must pass independently
- Run relevant tests: `npx vitest run src/lib/engine/<module>/`

When modifying rules in `dod_fmr/`, `gaap/`, `irs/`, `pcaob/`, or `sox/`:
- Create a new rule version, never edit an existing version
- Include the effective date and the legislative authority that triggered the change
- Update corresponding tests to cover the new version
