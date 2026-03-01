import type { ADAViolation } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

/**
 * ADA Violation Workflow
 *
 * Manages the lifecycle of Anti-Deficiency Act violations from
 * initial detection through investigation, confirmation, presidential
 * reporting, and corrective action per:
 *
 * - 31 U.S.C. §1341 (Over-obligation/expenditure)
 * - 31 U.S.C. §1517 (Apportionment/allotment violations)
 * - 31 U.S.C. §1351 (Reporting requirements)
 * - DoD FMR Volume 14 (ADA Procedures)
 */

/**
 * Creates a new ADA violation record with detected status and discoveredDate set to now.
 *
 * Per DoD FMR Vol 14, Ch 2, a potential ADA violation must be reported
 * immediately upon discovery to the head of the agency.
 */
export function reportViolation(
  violation: Partial<ADAViolation>,
  engagementId: string,
  fiscalYear: number
): ADAViolation {
  const now = new Date().toISOString();

  return {
    id: uuid(),
    engagementId,
    appropriationId: violation.appropriationId,
    violationType: violation.violationType ?? 'over_obligation',
    statutoryBasis: violation.statutoryBasis ?? '31 U.S.C. §1341(a)',
    amount: violation.amount ?? 0,
    description: violation.description ?? '',
    discoveredDate: now,
    reportedDate: undefined,
    responsibleOfficer: violation.responsibleOfficer,
    investigationStatus: 'detected',
    correctiveAction: undefined,
    violationDetails: violation.violationDetails,
    fiscalYear,
    createdAt: now,
  };
}

/**
 * Transitions a detected violation to under_investigation status and appends
 * investigation findings to the violationDetails field.
 *
 * Per DoD FMR Vol 14, Ch 3, a preliminary investigation must be completed
 * within 14 weeks of discovery. The investigation should determine:
 * - The facts and circumstances
 * - The responsible individual(s)
 * - Whether the violation is confirmed
 */
export function investigateViolation(
  violation: ADAViolation,
  findings: string
): ADAViolation {
  const existingDetails = violation.violationDetails
    ? `${violation.violationDetails}\n\n--- Investigation Findings ---\n${findings}`
    : `--- Investigation Findings ---\n${findings}`;

  return {
    ...violation,
    investigationStatus: 'under_investigation',
    violationDetails: existingDetails,
  };
}

/**
 * Confirms an ADA violation after the investigation determines that a
 * violation of 31 U.S.C. §1341(a) or §1517(a) did in fact occur.
 *
 * Per DoD FMR Vol 14, Ch 3, confirmed violations must be reported to the
 * President (through OMB), Congress, and the Comptroller General per
 * 31 U.S.C. §1351.
 */
export function confirmViolation(
  violation: ADAViolation,
  confirmation: string
): ADAViolation {
  const existingDetails = violation.violationDetails
    ? `${violation.violationDetails}\n\n--- Confirmation ---\n${confirmation}`
    : `--- Confirmation ---\n${confirmation}`;

  return {
    ...violation,
    investigationStatus: 'confirmed',
    violationDetails: existingDetails,
  };
}

/**
 * Generates the formal presidential report per 31 U.S.C. §1351 and updates
 * the violation status to reported_to_president.
 *
 * Per 31 U.S.C. §1351: "If an officer or employee of an executive agency ...
 * violates section 1341(a) or 1517(a) ... the head of the agency shall report
 * immediately to the President and Congress all relevant facts and a statement
 * of actions taken."
 *
 * The report is also submitted to the Comptroller General per OMB Circular A-11,
 * Section 145.
 */
export function generatePresidentialReport(
  violation: ADAViolation
): { violation: ADAViolation; reportText: string } {
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const violationTypeLabel = formatViolationType(violation.violationType);
  const statuteReference = violation.statutoryBasis || '31 U.S.C. §1341(a)';

  const reportText = [
    '=========================================================',
    'ANTI-DEFICIENCY ACT VIOLATION REPORT',
    'Pursuant to 31 U.S.C. §1351',
    '=========================================================',
    '',
    `Report Date: ${formattedDate}`,
    `Fiscal Year: ${violation.fiscalYear}`,
    `Violation ID: ${violation.id}`,
    '',
    '1. NATURE OF THE VIOLATION',
    `   Type: ${violationTypeLabel}`,
    `   Statutory Basis: ${statuteReference}`,
    `   Amount: $${violation.amount.toLocaleString()}`,
    '',
    '2. DESCRIPTION AND CIRCUMSTANCES',
    `   ${violation.description}`,
    '',
    violation.violationDetails
      ? `3. INVESTIGATION DETAILS\n   ${violation.violationDetails.replace(/\n/g, '\n   ')}`
      : '3. INVESTIGATION DETAILS\n   No additional details available.',
    '',
    '4. RESPONSIBLE INDIVIDUAL(S)',
    `   ${violation.responsibleOfficer || 'Under determination'}`,
    '',
    '5. APPROPRIATION AFFECTED',
    `   Appropriation ID: ${violation.appropriationId || 'N/A'}`,
    '',
    '6. CORRECTIVE ACTIONS TAKEN',
    `   ${violation.correctiveAction || 'Corrective actions are being developed.'}`,
    '',
    '7. ACTIONS TO PREVENT RECURRENCE',
    '   The agency is reviewing internal controls and fund management',
    '   procedures to prevent future violations. Specific measures include:',
    '   - Enhanced fund availability verification prior to obligation',
    '   - Improved training for certifying officers and fund managers',
    '   - Strengthened automated controls in financial management systems',
    '',
    '8. ADMINISTRATIVE DISCIPLINE',
    '   Per 31 U.S.C. §1349, appropriate administrative discipline will be',
    '   applied based on the outcome of the investigation, including but not',
    '   limited to reprimand, suspension, or removal from office for officers',
    '   or employees who knowingly and willfully violated the Act.',
    '',
    '=========================================================',
    'This report is submitted in compliance with 31 U.S.C. §1351,',
    'which requires the head of the agency to report immediately to',
    'the President (through OMB) and Congress all relevant facts',
    'regarding any violation of 31 U.S.C. §1341(a) or §1517(a).',
    '',
    'Copies furnished to:',
    '  - Office of Management and Budget (per OMB Circular A-11, §145)',
    '  - Senate Committee on Appropriations',
    '  - House Committee on Appropriations',
    '  - Comptroller General of the United States',
    '=========================================================',
  ].join('\n');

  const updatedViolation: ADAViolation = {
    ...violation,
    investigationStatus: 'reported_to_president',
    reportedDate: now.toISOString(),
  };

  return {
    violation: updatedViolation,
    reportText,
  };
}

/**
 * Records the corrective action taken for an ADA violation and transitions
 * the status to resolved.
 *
 * Per DoD FMR Vol 14, Ch 3, the agency must document the corrective actions
 * taken and submit a follow-up report. Corrective actions typically include
 * administrative discipline, process improvements, and system enhancements.
 */
export function trackCorrectiveAction(
  violation: ADAViolation,
  action: string
): ADAViolation {
  return {
    ...violation,
    correctiveAction: action,
    investigationStatus: 'resolved',
  };
}

// ── Internal Helpers ──

function formatViolationType(type: string): string {
  const labels: Record<string, string> = {
    over_obligation: 'Over-Obligation (31 U.S.C. §1341(a)(1)(A))',
    over_expenditure: 'Over-Expenditure (31 U.S.C. §1341(a)(1)(B))',
    unauthorized_purpose: 'Unauthorized Purpose (Purpose Statute)',
    advance_without_authority: 'Advance Without Authority',
    voluntary_service: 'Acceptance of Voluntary Services (31 U.S.C. §1342)',
    time_violation: 'Time Violation (Bona Fide Need Rule)',
  };
  return labels[type] || type;
}
