---
paths:
  - "src/lib/integrations/**"
---

# External Integration Rules

- Every integration must have an interface file defining the contract and a mock adapter for testing
- Never make real API calls in tests -- always use mock adapters
- Government integrations (DFAS, SAM, Treasury, USASpending, G-Invoicing) must handle:
  - Authentication token refresh
  - Rate limiting and retry with exponential backoff
  - Timeout handling (government APIs can be slow)
  - Graceful degradation when the external service is unavailable
- Log all external API calls at INFO level (but never log request/response bodies containing financial data)
