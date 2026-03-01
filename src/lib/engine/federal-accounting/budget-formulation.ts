/**
 * Budget Formulation Engine (DoD FMR Volumes 2A/2B)
 *
 * Implements the Planning, Programming, Budgeting, and Execution (PPBE)
 * process data structures and validation logic for DoD budget formulation.
 * Covers the full lifecycle from program planning through budget submission:
 *
 *   Planning -> Programming (POM) -> Budgeting (BES) -> Execution
 *
 * Key concepts:
 *   - PPBE Process: The DoD resource allocation framework that translates
 *     national security strategy into funded programs.
 *   - POM (Program Objective Memorandum): Component submission of
 *     programmatic and resource proposals covering the FYDP.
 *   - BES (Budget Estimate Submission): Component budget request
 *     submitted to OSD/OMB; forms the basis for the President's Budget.
 *   - FYDP (Future Years Defense Program): The 5-year resource plan
 *     linking programs to appropriations (10 U.S.C. ss221-223a).
 *   - URL (Unfunded Requirements List): Prioritized list of valid
 *     requirements not included in the budget submission.
 *
 * References:
 *   - DoD FMR Vol. 2A (Budget Formulation - Appropriation Structure)
 *   - DoD FMR Vol. 2B (Budget Formulation - Justification Materials)
 *   - OMB Circular A-11 (Preparation, Submission, and Execution of the Budget)
 *   - DoD Directive 7045.14 (PPBE Process)
 *   - 10 U.S.C. ss221-223a (Future-Years Defense Program)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** PPBE phase identifiers per DoD Directive 7045.14 */
export type PPBEPhase = 'planning' | 'programming' | 'budgeting' | 'execution';

/** Status of a PPBE record within a given phase */
export type PPBEStatus = 'not_started' | 'in_progress' | 'complete' | 'rejected';

/** Budget categories aligned with DoD FMR Vol. 2A, Ch. 1 */
export type BudgetCategory =
  | 'milpers'
  | 'om'
  | 'procurement'
  | 'rdte'
  | 'milcon'
  | 'family_housing'
  | 'revolving'
  | 'trust'
  | 'other';

/** Priority levels for unfunded requirements per congressional guidance */
export type UnfundedPriority = 1 | 2 | 3 | 4 | 5;

/**
 * A milestone within a PPBE phase (e.g. "POM submission deadline").
 *
 * Ref: DoD Directive 7045.14, Enclosure 3
 */
export interface PPBEMilestone {
  id: string;
  name: string;
  dueDate: string;
  completedDate?: string;
  description: string;
}

/**
 * Record tracking a single PPBE phase for a given fiscal year cycle.
 *
 * Ref: DoD Directive 7045.14, Enclosure 2
 */
export interface PPBERecord {
  id: string;
  fiscalYearCycle: number;
  phase: PPBEPhase;
  status: PPBEStatus;
  startDate: string;
  endDate: string;
  milestones: PPBEMilestone[];
  componentId: string;
  notes: string;
  createdAt: string;
}

/**
 * A line item within a Program Objective Memorandum.
 *
 * Ref: DoD FMR Vol. 2A, Ch. 1 - Appropriation Structure
 */
export interface POMLineItem {
  programElement: string;
  budgetCategory: BudgetCategory;
  budgetActivityCode: string;
  amounts: Record<number, number>;
  description: string;
}

/**
 * Program Objective Memorandum covering the FYDP period.
 * Components submit the POM during the Programming phase.
 *
 * Ref: DoD Directive 7045.14; 10 U.S.C. ss221
 */
export interface ProgramObjectiveMemorandum {
  id: string;
  componentId: string;
  fiscalYearStart: number;
  fydpYears: number[];
  lineItems: POMLineItem[];
  totalByYear: Record<number, number>;
  submissionDate: string;
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  createdAt: string;
}

/**
 * An exhibit within a Budget Estimate Submission (e.g. OP-5, R-1, P-1).
 *
 * Ref: DoD FMR Vol. 2B; OMB Circular A-11, Section 25
 */
export interface BESExhibit {
  exhibitType: string;
  appropriation: string;
  budgetActivity: string;
  amounts: Record<number, number>;
  justification: string;
}

/**
 * Budget Estimate Submission sent to OSD/OMB for review.
 *
 * Ref: DoD FMR Vol. 2B; OMB Circular A-11, Section 25
 */
export interface BudgetEstimateSubmission {
  id: string;
  componentId: string;
  fiscalYear: number;
  exhibits: BESExhibit[];
  totalBudgetAuthority: number;
  ombExhibitsIncluded: string[];
  submissionDate: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'revised';
  createdAt: string;
}

/**
 * A single entry in the Future Years Defense Program.
 *
 * Ref: 10 U.S.C. ss221; DoD Directive 7045.14
 */
export interface FYDPEntry {
  id: string;
  programElement: string;
  programTitle: string;
  budgetCategory: BudgetCategory;
  serviceComponent: string;
  amounts: Record<number, number>;
  fydpStartYear: number;
  fydpEndYear: number;
  createdAt: string;
}

/**
 * An unfunded requirement submitted on the Unfunded Requirements List.
 *
 * Ref: 10 U.S.C. ss222a; DoD FMR Vol. 2A, Ch. 1
 */
export interface UnfundedRequirement {
  id: string;
  componentId: string;
  fiscalYear: number;
  title: string;
  description: string;
  programElement: string;
  budgetCategory: BudgetCategory;
  amountRequired: number;
  priority: UnfundedPriority;
  justification: string;
  impactIfNotFunded: string;
  status: 'identified' | 'submitted' | 'acknowledged' | 'funded' | 'deferred';
  createdAt: string;
}

/**
 * Budget hierarchy node representing activity/sub-activity structure.
 *
 * Ref: DoD FMR Vol. 2A, Ch. 1; OMB Circular A-11, Section 82
 */
export interface BudgetHierarchyNode {
  code: string;
  title: string;
  level: 'appropriation' | 'budget_activity' | 'sub_activity' | 'line_item';
  parentCode?: string;
  amount: number;
}

/** Result returned by validation functions */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valid PPBE phase transitions per DoD Directive 7045.14.
 * Phases must proceed in order; regression is not permitted.
 */
const PHASE_ORDER: Record<PPBEPhase, number> = {
  planning: 0,
  programming: 1,
  budgeting: 2,
  execution: 3,
};

/** Standard FYDP window is 5 years per 10 U.S.C. ss221 */
const FYDP_WINDOW_YEARS = 5;

/** OMB A-11 standard exhibit types required for BES */
const REQUIRED_OMB_EXHIBITS = [
  'MAX Schedule',
  'Program and Financing (SF-132)',
  'Object Classification',
  'Personnel Summary',
];

// ---------------------------------------------------------------------------
// PPBE Process Tracking
// ---------------------------------------------------------------------------

/**
 * Validates a PPBE phase transition ensuring proper sequencing.
 *
 * The PPBE process follows a strict sequential order:
 *   Planning -> Programming -> Budgeting -> Execution
 *
 * Backward transitions are prohibited. The current phase must be
 * complete before advancing to the next phase.
 *
 * Ref: DoD Directive 7045.14, Enclosure 2
 *
 * @param current  - The current PPBE record being transitioned from.
 * @param newPhase - The target phase to transition to.
 * @returns A new PPBERecord advanced to the target phase, or throws
 *          if the transition is invalid.
 */
export function trackPPBEPhase(
  current: PPBERecord,
  newPhase: PPBEPhase,
): PPBERecord {
  const currentOrder = PHASE_ORDER[current.phase];
  const targetOrder = PHASE_ORDER[newPhase];

  if (targetOrder <= currentOrder) {
    throw new Error(
      `Invalid PPBE phase transition: cannot move from '${current.phase}' ` +
      `to '${newPhase}'. Phases must advance sequentially per ` +
      `DoD Directive 7045.14.`,
    );
  }

  if (targetOrder !== currentOrder + 1) {
    throw new Error(
      `Invalid PPBE phase transition: cannot skip from '${current.phase}' ` +
      `to '${newPhase}'. Each phase must complete before the next begins ` +
      `(DoD Directive 7045.14, Enclosure 2).`,
    );
  }

  if (current.status !== 'complete') {
    throw new Error(
      `Current phase '${current.phase}' has status '${current.status}' ` +
      `and must be 'complete' before transitioning to '${newPhase}'.`,
    );
  }

  const now = new Date().toISOString();

  return {
    ...current,
    id: uuid(),
    phase: newPhase,
    status: 'in_progress',
    startDate: now,
    endDate: '',
    milestones: [],
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// POM Validation
// ---------------------------------------------------------------------------

/**
 * Validates a Program Objective Memorandum for completeness and
 * consistency with FYDP requirements.
 *
 * Checks performed:
 *   1. FYDP year coverage matches the standard 5-year window
 *   2. All line items have a valid program element and budget category
 *   3. Year totals in lineItems agree with totalByYear
 *   4. No negative amounts
 *
 * Ref: DoD Directive 7045.14; 10 U.S.C. ss221; DoD FMR Vol. 2A, Ch. 1
 *
 * @param pom - The Program Objective Memorandum to validate.
 * @returns A ValidationResult with any errors or warnings found.
 */
export function validatePOM(pom: ProgramObjectiveMemorandum): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate FYDP year coverage
  if (pom.fydpYears.length !== FYDP_WINDOW_YEARS) {
    errors.push(
      `POM must cover exactly ${FYDP_WINDOW_YEARS} FYDP years per ` +
      `10 U.S.C. ss221. Found ${pom.fydpYears.length} year(s).`,
    );
  }

  const sortedYears = [...pom.fydpYears].sort((a, b) => a - b);
  for (let i = 1; i < sortedYears.length; i++) {
    if (sortedYears[i] !== sortedYears[i - 1] + 1) {
      errors.push(
        `FYDP years must be consecutive. Gap detected between ` +
        `FY${sortedYears[i - 1]} and FY${sortedYears[i]}.`,
      );
    }
  }

  // 2. Validate line items
  for (const item of pom.lineItems) {
    if (!item.programElement || item.programElement.trim() === '') {
      errors.push(
        `Line item for '${item.description}' is missing a program ` +
        `element code. All POM entries must map to a PE for FYDP ` +
        `traceability (DoD Directive 7045.14).`,
      );
    }

    for (const [yearStr, amount] of Object.entries(item.amounts)) {
      if (amount < 0) {
        errors.push(
          `Negative amount $${amount} found in PE ${item.programElement} ` +
          `for FY${yearStr}. POM amounts must be non-negative.`,
        );
      }
    }
  }

  // 3. Verify year totals
  for (const fy of pom.fydpYears) {
    const computedTotal = round2(
      pom.lineItems.reduce((sum, li) => sum + (li.amounts[fy] ?? 0), 0),
    );
    const reportedTotal = round2(pom.totalByYear[fy] ?? 0);

    if (computedTotal !== reportedTotal) {
      errors.push(
        `FY${fy} total mismatch: line items sum to ` +
        `$${computedTotal.toFixed(2)} but totalByYear reports ` +
        `$${reportedTotal.toFixed(2)}. Totals must reconcile ` +
        `(DoD FMR Vol. 2A, Ch. 1).`,
      );
    }
  }

  // 4. Advisory: check for zero-funded years
  for (const fy of pom.fydpYears) {
    const yearTotal = pom.totalByYear[fy] ?? 0;
    if (yearTotal === 0) {
      warnings.push(
        `FY${fy} has zero total funding in the POM. Verify this ` +
        `is intentional and not a data omission.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// BES Generation
// ---------------------------------------------------------------------------

/**
 * Generates a Budget Estimate Submission from a validated POM and
 * supplemental exhibit data.
 *
 * The BES is the component's formal budget request submitted to OSD
 * and subsequently to OMB for inclusion in the President's Budget.
 * This function assembles exhibit data and validates that required
 * OMB A-11 exhibits are present.
 *
 * Ref: DoD FMR Vol. 2B; OMB Circular A-11, Section 25
 *
 * @param componentId - The DoD component submitting the BES.
 * @param fiscalYear  - The budget year for the submission.
 * @param exhibits    - Array of BES exhibit data.
 * @returns A fully constructed BudgetEstimateSubmission.
 */
export function generateBES(
  componentId: string,
  fiscalYear: number,
  exhibits: BESExhibit[],
): BudgetEstimateSubmission {
  if (!componentId || componentId.trim() === '') {
    throw new Error('Component ID is required for BES generation.');
  }

  if (exhibits.length === 0) {
    throw new Error(
      'At least one exhibit is required for a Budget Estimate Submission ' +
      '(DoD FMR Vol. 2B).',
    );
  }

  const totalBudgetAuthority = round2(
    exhibits.reduce((sum, ex) => {
      const exhibitTotal = Object.values(ex.amounts).reduce(
        (s, a) => s + a,
        0,
      );
      return sum + exhibitTotal;
    }, 0),
  );

  const ombExhibitsIncluded = Array.from(
    new Set(exhibits.map(ex => ex.exhibitType)),
  );

  const missingExhibits = REQUIRED_OMB_EXHIBITS.filter(
    req => !ombExhibitsIncluded.includes(req),
  );

  if (missingExhibits.length > 0) {
    throw new Error(
      `BES is missing required OMB A-11 exhibits: ` +
      `${missingExhibits.join(', ')}. All standard exhibits must be ` +
      `included per OMB Circular A-11, Section 25.`,
    );
  }

  const now = new Date().toISOString();

  return {
    id: uuid(),
    componentId: componentId.trim(),
    fiscalYear,
    exhibits,
    totalBudgetAuthority,
    ombExhibitsIncluded,
    submissionDate: now,
    status: 'draft',
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// FYDP Linkage
// ---------------------------------------------------------------------------

/**
 * Validates consistency of FYDP entries ensuring proper 5-year
 * projection coverage and budget category alignment.
 *
 * Checks performed:
 *   1. Each entry spans exactly the FYDP window (5 years)
 *   2. Year amounts are non-negative
 *   3. No duplicate program element / component combinations
 *   4. Amounts are present for every year in the window
 *
 * Ref: 10 U.S.C. ss221-223a; DoD Directive 7045.14
 *
 * @param entries - Array of FYDP entries to validate.
 * @returns A ValidationResult with any errors or warnings found.
 */
export function validateFYDPConsistency(
  entries: FYDPEntry[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entries.length === 0) {
    errors.push('No FYDP entries provided for consistency validation.');
    return { valid: false, errors, warnings };
  }

  const peComponentPairs = new Set<string>();

  for (const entry of entries) {
    // 1. Validate year span
    const yearSpan = entry.fydpEndYear - entry.fydpStartYear + 1;
    if (yearSpan !== FYDP_WINDOW_YEARS) {
      errors.push(
        `FYDP entry '${entry.programTitle}' (PE: ${entry.programElement}) ` +
        `spans ${yearSpan} year(s) (FY${entry.fydpStartYear}-` +
        `FY${entry.fydpEndYear}), but the FYDP window requires exactly ` +
        `${FYDP_WINDOW_YEARS} years per 10 U.S.C. ss221.`,
      );
    }

    // 2. Validate amounts
    for (let fy = entry.fydpStartYear; fy <= entry.fydpEndYear; fy++) {
      const amount = entry.amounts[fy];
      if (amount === undefined || amount === null) {
        errors.push(
          `FYDP entry '${entry.programTitle}' (PE: ${entry.programElement}) ` +
          `is missing an amount for FY${fy}.`,
        );
      } else if (amount < 0) {
        errors.push(
          `FYDP entry '${entry.programTitle}' (PE: ${entry.programElement}) ` +
          `has negative amount $${amount} for FY${fy}.`,
        );
      }
    }

    // 3. Check for duplicates
    const pairKey = `${entry.programElement}|${entry.serviceComponent}`;
    if (peComponentPairs.has(pairKey)) {
      errors.push(
        `Duplicate FYDP entry for PE ${entry.programElement} / ` +
        `component '${entry.serviceComponent}'. Each program element ` +
        `should appear once per component in the FYDP.`,
      );
    }
    peComponentPairs.add(pairKey);

    // 4. Advisory: large year-over-year swings
    const years = Object.keys(entry.amounts)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      const prev = entry.amounts[years[i - 1]] ?? 0;
      const curr = entry.amounts[years[i]] ?? 0;
      if (prev > 0) {
        const changePct = Math.abs((curr - prev) / prev);
        if (changePct > 0.5) {
          warnings.push(
            `FYDP entry '${entry.programTitle}' (PE: ${entry.programElement}) ` +
            `has a ${(changePct * 100).toFixed(0)}% change from FY${years[i - 1]} ` +
            `to FY${years[i]}. Large swings may require justification in ` +
            `budget documentation (DoD FMR Vol. 2B).`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Unfunded Requirements
// ---------------------------------------------------------------------------

/**
 * Validates and tracks a list of unfunded requirements (URL).
 *
 * Service Chiefs submit Unfunded Requirements Lists to Congress
 * identifying valid requirements not included in the President's
 * Budget. This function validates priority ordering, ensures no
 * duplicate entries, and verifies required fields.
 *
 * Ref: 10 U.S.C. ss222a; DoD FMR Vol. 2A, Ch. 1
 *
 * @param requirements - Array of unfunded requirements to process.
 * @returns An object containing the validated list and a ValidationResult.
 */
export function trackUnfundedRequirements(
  requirements: UnfundedRequirement[],
): { validated: UnfundedRequirement[]; result: ValidationResult } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (requirements.length === 0) {
    return {
      validated: [],
      result: { valid: true, errors, warnings },
    };
  }

  const seenTitles = new Set<string>();
  const validated: UnfundedRequirement[] = [];

  for (const req of requirements) {
    // Validate required fields
    if (!req.title || req.title.trim() === '') {
      errors.push(
        `Unfunded requirement ID ${req.id} is missing a title. ` +
        `All URL entries must have a descriptive title per ` +
        `10 U.S.C. ss222a.`,
      );
    }

    if (req.amountRequired <= 0) {
      errors.push(
        `Unfunded requirement '${req.title}' has non-positive amount ` +
        `$${req.amountRequired}. Amount must be positive.`,
      );
    }

    if (!req.justification || req.justification.trim() === '') {
      errors.push(
        `Unfunded requirement '${req.title}' is missing justification. ` +
        `All URL submissions must include justification per ` +
        `10 U.S.C. ss222a.`,
      );
    }

    // Check for duplicates by title
    const titleKey = req.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) {
      warnings.push(
        `Duplicate unfunded requirement title detected: '${req.title}'. ` +
        `Consolidate entries where possible.`,
      );
    }
    seenTitles.add(titleKey);

    validated.push(req);
  }

  // Verify priority ordering (should be 1..N with no gaps)
  const priorities = requirements.map(r => r.priority).sort((a, b) => a - b);
  const uniquePriorities = Array.from(new Set(priorities));
  if (uniquePriorities.length < requirements.length) {
    warnings.push(
      'Multiple unfunded requirements share the same priority level. ' +
      'Each requirement should have a unique priority ranking for ' +
      'congressional clarity.',
    );
  }

  return {
    validated,
    result: { valid: errors.length === 0, errors, warnings },
  };
}

// ---------------------------------------------------------------------------
// Budget Activity Validation
// ---------------------------------------------------------------------------

/**
 * Validates a budget hierarchy ensuring proper parent-child
 * relationships and amount roll-ups per DoD FMR Vol. 2A.
 *
 * Budget structure (top to bottom):
 *   Appropriation -> Budget Activity -> Sub-Activity -> Line Item
 *
 * Checks performed:
 *   1. Every non-root node has a valid parent
 *   2. Parent amounts equal the sum of child amounts
 *   3. No orphan nodes at any level
 *   4. Proper level sequencing (no sub-activity without a budget activity)
 *
 * Ref: DoD FMR Vol. 2A, Ch. 1; OMB Circular A-11, Section 82
 *
 * @param nodes - Array of budget hierarchy nodes to validate.
 * @returns A ValidationResult with any errors or warnings found.
 */
export function validateBudgetHierarchy(
  nodes: BudgetHierarchyNode[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push('No budget hierarchy nodes provided for validation.');
    return { valid: false, errors, warnings };
  }

  const nodeMap = new Map<string, BudgetHierarchyNode>();
  for (const node of nodes) {
    if (nodeMap.has(node.code)) {
      errors.push(
        `Duplicate budget hierarchy code '${node.code}'. ` +
        `Each node must have a unique code.`,
      );
    }
    nodeMap.set(node.code, node);
  }

  const levelOrder: Record<BudgetHierarchyNode['level'], number> = {
    appropriation: 0,
    budget_activity: 1,
    sub_activity: 2,
    line_item: 3,
  };

  // Validate parent-child relationships
  for (const node of nodes) {
    if (node.level === 'appropriation') {
      if (node.parentCode) {
        warnings.push(
          `Appropriation node '${node.code}' has a parent code ` +
          `'${node.parentCode}' but appropriations are root-level ` +
          `nodes (DoD FMR Vol. 2A, Ch. 1).`,
        );
      }
      continue;
    }

    if (!node.parentCode) {
      errors.push(
        `Budget hierarchy node '${node.code}' (level: ${node.level}) ` +
        `has no parent code. All non-appropriation nodes must have a ` +
        `parent per DoD FMR Vol. 2A.`,
      );
      continue;
    }

    const parent = nodeMap.get(node.parentCode);
    if (!parent) {
      errors.push(
        `Budget hierarchy node '${node.code}' references parent ` +
        `'${node.parentCode}' which does not exist. Orphan nodes ` +
        `violate the budget structure requirements.`,
      );
      continue;
    }

    // Verify proper level sequencing
    const parentLevel = levelOrder[parent.level];
    const childLevel = levelOrder[node.level];
    if (childLevel !== parentLevel + 1) {
      errors.push(
        `Budget hierarchy node '${node.code}' (level: ${node.level}) ` +
        `is under parent '${node.parentCode}' (level: ${parent.level}). ` +
        `Expected parent level to be one above child level ` +
        `(DoD FMR Vol. 2A, Ch. 1).`,
      );
    }
  }

  // Validate amount roll-ups: parent amount should equal sum of children
  const childrenByParent = new Map<string, BudgetHierarchyNode[]>();
  for (const node of nodes) {
    if (node.parentCode) {
      const siblings = childrenByParent.get(node.parentCode) ?? [];
      siblings.push(node);
      childrenByParent.set(node.parentCode, siblings);
    }
  }

  for (const [parentCode, children] of Array.from(childrenByParent.entries())) {
    const parent = nodeMap.get(parentCode);
    if (!parent) continue;

    const childSum = round2(
      children.reduce((sum, c) => sum + c.amount, 0),
    );
    const parentAmount = round2(parent.amount);

    if (childSum !== parentAmount) {
      errors.push(
        `Budget hierarchy roll-up error: parent '${parentCode}' ` +
        `(${parent.title}) has amount $${parentAmount.toFixed(2)} but ` +
        `children sum to $${childSum.toFixed(2)}. Amounts must ` +
        `reconcile per OMB Circular A-11, Section 82.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
