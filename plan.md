# Enterprise Audit Opinion Production Plan

## Gap Analysis: Missing Features for Unqualified Audit Opinions

An unqualified (clean) audit opinion requires the auditor to conclude that sufficient appropriate audit evidence has been obtained, financial statements are free from material misstatement, and internal controls are effective. The current system has strong rule engines and analysis but lacks several critical enterprise features required for production-ready opinion issuance.

---

## Phase 1: Audit Evidence Foundation

### 1.1 Audit Sampling Engine (`src/lib/engine/sampling/`)
**Gap**: No statistical sampling methodology exists. Sample sizes in SOX test results are manually entered with no algorithmic generation.

**Implementation**:
- `sampling-plan.ts` — Generate sampling plans with:
  - **Attribute sampling** (for controls testing): AICPA-aligned tables, expected deviation rate, tolerable rate, confidence level (90%/95%)
  - **Variables sampling** (for substantive testing): MUS (Monetary Unit Sampling), stratified random, systematic selection
  - **Sample size calculators**: Based on population size, risk of material misstatement, tolerable misstatement, expected misstatement
- `sample-selection.ts` — Automated selection methods:
  - Random selection (seeded PRNG for reproducibility)
  - Systematic selection with random start
  - Stratified selection by amount/account type
  - MUS (probability proportional to size) selection
- `sample-evaluation.ts` — Exception projection:
  - Attribute: upper deviation rate calculation
  - Variables: projected misstatement with precision intervals
  - Tainting factor computation for MUS
  - Determine if results support reliance on controls or substantive conclusions
- New DB table: `sampling_plans` (engagementId, populationType, method, parameters, sampleSize, selectedItems, results, conclusion)
- API routes: `POST/GET /api/engagements/[id]/sampling`
- Tests: Unit tests for all sampling formulas

### 1.2 Summary of Unadjusted Differences (SUD) (`src/lib/engine/adjustments/`)
**Gap**: No tracking of proposed audit adjustments, recorded adjustments, or passed (waived) adjustments. The aggregate effect of uncorrected misstatements is critical for the opinion decision.

**Implementation**:
- `adjustment-tracker.ts` — Track three categories:
  - **Proposed Adjusting Journal Entries (AJEs)**: Auditor-proposed corrections
  - **Recorded AJEs**: Accepted and posted by management
  - **Passed Adjustments**: Waived as immaterial individually, but must be aggregated
- `misstatement-aggregator.ts` — Aggregate analysis:
  - Cumulative effect of all passed adjustments
  - Rollover of prior-year passed adjustments (iron curtain vs. rollover method)
  - Net income impact assessment
  - Balance sheet / income statement classification
  - Compare aggregate to performance materiality and overall materiality
  - Flag if aggregate exceeds materiality → blocks unqualified opinion
- New DB table: `audit_adjustments` (engagementId, type: proposed|recorded|passed, debitAccount, creditAccount, amount, description, findingId, approvedBy, status)
- API routes: `POST/GET/PATCH /api/engagements/[id]/adjustments`
- UI component: SUD schedule with running totals on the engagement reports page

### 1.3 Financial Statement Assertion Mapping (`src/lib/engine/assertions/`)
**Gap**: No mapping of audit procedures/findings to the 5 financial statement assertions. Auditors must obtain evidence for each assertion for each material account.

**Implementation**:
- `assertion-coverage.ts` — Map procedures to assertions:
  - **Existence/Occurrence**: Confirmations, physical observation, inspection
  - **Completeness**: Cutoff testing, search for unrecorded liabilities
  - **Valuation/Allocation**: Recalculation, independent estimates
  - **Rights & Obligations**: Inspection of documents, confirmation
  - **Presentation & Disclosure**: Review of financial statement presentation
- `coverage-matrix.ts` — Generate assertion coverage matrix:
  - For each material account: which assertions are covered, by which procedures
  - Identify gaps where an assertion has no supporting evidence
  - Flag uncovered assertions → blocks opinion issuance
- New DB table: `assertion_coverage` (engagementId, accountId, assertion, procedureType, evidenceReference, coveredBy, status)
- UI: Assertion coverage heat map on engagement dashboard

---

## Phase 2: Opinion Decision Engine Enhancement

### 2.1 Going Concern Assessment Module (`src/lib/engine/going-concern/`)
**Gap**: Going concern indicators are scattered across GAAP debt/equity rules. No standalone ASC 205-40 evaluation exists.

**Implementation**:
- `going-concern-evaluator.ts` — Standalone assessment:
  - **Quantitative indicators**: Negative working capital, recurring operating losses, negative cash flow from operations, debt covenant violations, loan defaults, denial of trade credit
  - **12-month forward projection**: Project cash flows 12 months from FS date using trends
  - **Management plan evaluation**: Assess feasibility and adequacy of mitigation plans
  - **Mitigating factors**: Asset liquidation, debt restructuring, equity infusion, cost reduction
  - **Conclusion**: No substantial doubt / Substantial doubt mitigated / Substantial doubt exists
- `going-concern-opinion-impact.ts` — Map conclusion to opinion modification:
  - No doubt → No impact on opinion
  - Doubt mitigated → Emphasis of matter paragraph
  - Doubt exists, adequate disclosure → Emphasis of matter paragraph
  - Doubt exists, inadequate disclosure → Qualified or adverse
- New DB table: `going_concern_assessments` (engagementId, indicators JSON, projections JSON, managementPlan, conclusion, opinionImpact)
- Integration with `determineOpinion()` to factor going concern into the opinion

### 2.2 Scope Limitation Tracker (`src/lib/engine/scope/`)
**Gap**: No mechanism to track audit scope limitations. A scope limitation is the single most common trigger for disclaimer of opinion, which is currently unreachable in the logic.

**Implementation**:
- `scope-tracker.ts` — Track scope limitations:
  - Client-imposed restrictions (denied access to records, locations, personnel)
  - Circumstantial limitations (destroyed records, late appointment)
  - Each limitation: description, accounts affected, estimated impact, pervasiveness
- `scope-evaluator.ts` — Assess impact on opinion:
  - Possible effect is material but not pervasive → Qualified opinion
  - Possible effect is material AND pervasive → Disclaimer of opinion
  - No limitations → No impact
- Update `determineOpinion()` to incorporate scope limitations:
  - Add scope limitations to `AuditOpinionData` interface
  - Implement disclaimer logic (currently unreachable in the code)
- New DB table: `scope_limitations` (engagementId, description, accountsAffected, estimatedImpact, pervasive, imposedBy)
- API routes: `POST/GET /api/engagements/[id]/scope-limitations`

### 2.3 Enhanced Opinion Determination (`src/lib/reports/audit-opinion.ts`)
**Gap**: Current opinion logic uses only material weakness counts and critical finding counts. Production audit opinions require evaluation of multiple additional factors.

**Implementation** — Enhance `determineOpinion()`:
- **Inputs expansion**:
  - Aggregate unadjusted misstatements (from SUD)
  - Going concern conclusion
  - Scope limitations
  - Assertion coverage gaps
  - Sampling results summary
  - Prior-year adjustments rollover
- **Emphasis of Matter (EOM) paragraphs**: ASC 855 subsequent events, going concern, accounting changes, related party transactions
- **Other Matter paragraphs**: Prior period reports by other auditors, supplementary information
- **Critical Audit Matters (CAM)**: For PCAOB audits — matters communicated to audit committee, related to material accounts, involved especially challenging judgment (AS 3101)
- **Opinion blocking conditions** — Systematically check:
  1. Aggregate uncorrected misstatements < materiality
  2. No uncovered material assertions
  3. No unresolved scope limitations
  4. Going concern properly assessed
  5. All sampling conclusions support reliance
  6. Engagement completion checklist signed off
  7. Independence confirmed
- **Output expansion**: Add `emphasisOfMatter`, `otherMatter`, `criticalAuditMatters`, `blockingConditions` to `OpinionResult`

---

## Phase 3: Engagement Quality & Compliance

### 3.1 Engagement Completion Checklist (`src/lib/workflow/completion-checklist.ts`)
**Gap**: No systematic checklist to verify all required procedures are completed before opinion issuance. This is required by ISQM 1 / SQCS No. 8.

**Implementation**:
- `completion-checklist.ts` — Define required items:
  - Planning & risk assessment completed
  - Materiality determined and documented
  - All material accounts tested (assertion coverage complete)
  - Sampling plans executed and evaluated
  - All findings reviewed and dispositioned
  - Management representations obtained
  - Going concern evaluated
  - Subsequent events procedures performed
  - Related party procedures completed
  - SUD evaluated (aggregate below materiality)
  - All workpapers reviewed
  - Engagement quality review completed (if applicable)
  - Independence confirmed
- `checklist-evaluator.ts` — Automatic population:
  - Auto-check items based on database state (e.g., if all findings are resolved/reviewed)
  - Manual-check items requiring human confirmation
  - Block opinion export if checklist is incomplete
- New DB table: `completion_checklist_items` (engagementId, itemKey, description, autoCheck, status, completedBy, completedAt, notes)
- API: `GET/PATCH /api/engagements/[id]/completion-checklist`
- Integration: Opinion export API checks checklist completeness

### 3.2 Management Representation Letter Generator (`src/lib/reports/representation-letter.ts`)
**Gap**: No management representation letter generation. AU-C 580 requires written representations from management for every audit. Without it, an unqualified opinion cannot be issued.

**Implementation**:
- `representation-letter.ts` — Generate letter including:
  - Management acknowledgment of responsibility for financial statements
  - Confirmation of fair presentation in accordance with GAAP
  - All material transactions recorded
  - Related party transactions properly disclosed
  - Subsequent events properly accounted for
  - No uncorrected misstatements believed to be material (with SUD attached)
  - Fraud and suspected fraud disclosure
  - Compliance with laws and regulations
  - Going concern assessment
  - Dynamic: Auto-populate entity-specific representations based on findings
- Output: Formatted letter with signature blocks for CEO and CFO
- API: Add `type=representation_letter` to export route

### 3.3 Independence Tracking (`src/lib/workflow/independence.ts`)
**Gap**: No independence confirmation mechanism. AU-C 200 / PCAOB Rule 3520 require auditor independence as a precondition for any opinion.

**Implementation**:
- `independence-tracker.ts`:
  - Engagement-level independence confirmation
  - Team member independence declarations
  - Fee arrangement documentation (no contingent fees)
  - Non-audit services log (tax, advisory) with pre-approval tracking
  - Independence threats: self-interest, self-review, advocacy, familiarity, intimidation
  - Safeguards documentation
- New DB table: `independence_confirmations` (engagementId, userId, confirmationType, confirmed, threats, safeguards, confirmedAt)
- Integration: Checklist item + opinion blocking condition

---

## Phase 4: Related Party & Specialized Procedures

### 4.1 Related Party Management (`src/lib/engine/related-parties/`)
**Gap**: Current related party detection is keyword-based only. No entity relationship mapping, arm's length assessment, or ASC 850 disclosure verification.

**Implementation**:
- `related-party-registry.ts`:
  - Entity relationship database (parent, subsidiary, affiliate, key management, close family)
  - Ownership percentage and control indicators
  - Related party transaction register with amounts, terms, business purpose
- `related-party-analysis.ts`:
  - Identify transactions with registered related parties in journal entries
  - Compare pricing/terms to market rates (arm's length assessment)
  - Aggregate related party transaction volume
  - ASC 850 disclosure completeness checklist
  - Flag undisclosed relationships
- New DB tables:
  - `related_parties` (engagementId, partyName, relationship, ownershipPct, controlIndicators)
  - `related_party_transactions` (engagementId, partyId, transactionType, amount, terms, armLengthAssessment, disclosed)
- API routes: `POST/GET /api/engagements/[id]/related-parties`

### 4.2 Subsequent Events Procedure Log (`src/lib/workflow/subsequent-events.ts`)
**Gap**: Rules detect subsequent event risk, but there's no tracking of whether the required procedures were actually performed and documented.

**Implementation**:
- `subsequent-events-log.ts` — Track completion of required procedures:
  - Board/audit committee minutes reviewed
  - Management inquiry performed
  - Legal counsel inquiry (attorney letters)
  - Post-balance-sheet cash receipts/disbursements tested
  - Post-close journal entries reviewed
  - Subsequent litigation/claims assessed
  - Type I (adjusting) vs Type II (non-adjusting) event classification
  - Dual-dating considerations for late-discovered events
- New DB table: `subsequent_events` (engagementId, eventDescription, eventType, procedurePerformed, conclusion, adjustmentRequired, disclosureRequired)
- Integration with completion checklist

---

## Phase 5: Reporting & Output

### 5.1 Comprehensive Audit Report Package (`src/lib/reports/`)
**Gap**: Reports are text-based. The audit opinion lacks EOM/OM/CAM paragraphs, the report package doesn't include all required deliverables.

**Implementation** — Enhance report generation:
- **Enhanced opinion text**: Add EOM, OM, CAM paragraph generation
- **Report on Internal Controls (ICFR)**: Separate report for integrated audits per AS 2201
- **Representation letter**: Included in package
- **SUD schedule**: Attached to representation letter
- **Communication with governance** (AU-C 260): Required communications letter to audit committee covering:
  - Auditor responsibilities
  - Planned scope and timing
  - Significant findings
  - Significant accounting policies
  - Management judgments and estimates
  - Uncorrected misstatements
  - Disagreements with management
- Update export route to support `type=full_package` returning all deliverables

### 5.2 Opinion Readiness Dashboard (`src/app/engagements/[id]/opinion/`)
**Gap**: No UI showing whether the engagement is ready for opinion issuance.

**Implementation**:
- New page: Opinion Readiness Dashboard showing:
  - Completion checklist status (items done / total)
  - SUD aggregate vs. materiality (bar chart)
  - Assertion coverage matrix (heat map)
  - Scope limitations summary
  - Going concern assessment status
  - Sampling conclusions summary
  - Independence confirmations
  - Blocking conditions (red/green indicators)
  - Projected opinion type based on current state
  - "Generate Opinion" button (disabled if blocking conditions exist)

---

## Implementation Priority & Dependencies

```
Phase 1 (Foundation) — Must be done first
  1.2 SUD Tracker ← feeds into opinion logic
  1.1 Sampling Engine ← provides audit evidence
  1.3 Assertion Mapping ← ensures coverage

Phase 2 (Opinion Engine) — Depends on Phase 1
  2.1 Going Concern ← uses financial data + new indicators
  2.2 Scope Limitations ← new tracking
  2.3 Enhanced Opinion ← integrates all Phase 1 + 2 inputs

Phase 3 (Quality) — Can partially parallel Phase 2
  3.1 Completion Checklist ← gates opinion issuance
  3.2 Representation Letter ← required deliverable
  3.3 Independence ← precondition for opinion

Phase 4 (Specialized) — Can parallel Phase 3
  4.1 Related Parties ← enhances finding quality
  4.2 Subsequent Events Log ← documents procedures

Phase 5 (Reporting) — Final phase, depends on all above
  5.1 Report Package ← assembles all deliverables
  5.2 Opinion Dashboard ← visualizes readiness
```

---

## Database Migrations Required

New tables (7):
1. `sampling_plans` — Sampling methodology and results
2. `audit_adjustments` — Proposed/recorded/passed AJEs
3. `assertion_coverage` — Procedure-to-assertion mapping
4. `going_concern_assessments` — ASC 205-40 evaluations
5. `scope_limitations` — Audit scope restrictions
6. `completion_checklist_items` — Engagement completion tracking
7. `independence_confirmations` — Independence declarations

Modified tables:
- `related_parties` (new) + `related_party_transactions` (new) — Phase 4
- `subsequent_events` (new) — Phase 4

---

## Test Coverage Requirements

Each new module requires:
- Unit tests for business logic (sampling formulas, aggregation, opinion determination)
- Integration tests for API routes
- Edge case coverage (zero populations, negative amounts, missing data)
- Opinion determination tests covering all paths including new disclaimer logic

---

## Files Modified

Existing files to modify:
- `src/lib/reports/audit-opinion.ts` — Major enhancement (Phase 2.3)
- `src/lib/reports/audit-opinion.test.ts` — Expanded test cases
- `src/app/api/export/route.ts` — New export types
- `src/lib/db/schema.ts` — New table definitions
- `src/types/` — New type definitions

New files (estimated ~20):
- 6 new engine modules (sampling, adjustments, assertions, going-concern, scope, related-parties)
- 3 new report generators (representation letter, ICFR report, governance communication)
- 3 new API route directories
- 2 workflow modules (completion checklist, independence)
- 1 new UI page (opinion readiness dashboard)
- 5+ test files
