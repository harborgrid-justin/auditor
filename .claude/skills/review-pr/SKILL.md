---
name: review-pr
description: Review a pull request for correctness, security, and compliance
---

Review the pull request: $ARGUMENTS

1. Fetch PR details: `gh pr view $ARGUMENTS`
2. Read the diff: `gh pr diff $ARGUMENTS`
3. For each changed file, check:
   - Does it follow the path-specific rules for that area?
   - Are there security implications? (use security-reviewer agent for auth/financial changes)
   - Are tests added or updated?
   - Is validation present for new API inputs?
   - Are regulatory references cited for engine changes?
4. Check CI status: `gh pr checks $ARGUMENTS`
5. Provide structured feedback:
   - **Security**: auth, data classification, or SoD concerns
   - **Correctness**: logic issues, edge cases, missing error handling
   - **Compliance**: missing regulatory references, rule versioning violations
   - **Testing**: missing test coverage
   - **Style**: convention violations
6. Submit review: `gh pr review $ARGUMENTS --comment --body "<feedback>"`
