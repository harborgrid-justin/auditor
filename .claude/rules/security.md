---
paths:
  - "src/lib/security/**"
  - "server/src/auth/**"
  - "server/src/common/guards/**"
  - "src/lib/auth/**"
---

# Security Module Rules

This is a financial compliance system handling government data. Security is paramount.

- Never weaken existing security controls
- NIST 800-53 mappings in `nist-800-53-mapping.ts` must stay current with Rev. 5
- FIPS mode (`fips-mode.ts`) must use approved cryptographic algorithms only
- SoD rules in `separation-of-duties.ts` are regulatory requirements -- do not bypass or add override capability without citing the specific exception authority
- Data classification levels (unclassified, CUI, CUI_specified, FOUO) must be enforced on all DoD data
- Auth guards must be applied to every backend controller (except health check)
- JWT tokens must have reasonable expiration (not > 24 hours)
- SAML integration follows DoD PKI requirements
