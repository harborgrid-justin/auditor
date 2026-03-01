import { describe, it, expect } from 'vitest';
import {
  CorrectiveActionPlanManager,
  type CorrectiveActionPlan,
  type CAPMilestone,
} from '@/lib/workflow/corrective-action-plans';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a default set of params for createFromFinding. */
function defaultCAPParams(overrides: Record<string, unknown> = {}) {
  return {
    engagementId: 'eng-1',
    findingId: 'finding-1',
    findingTitle: 'Material Weakness: Fund Balance with Treasury Reconciliation',
    category: 'material_weakness' as const,
    priority: 'high' as const,
    deficiencyDescription: 'FBWT reconciliation not performed monthly.',
    rootCause: 'Lack of documented reconciliation procedures.',
    correctiveAction: 'Implement monthly FBWT reconciliation procedures per DoD FMR Vol. 4, Ch. 2.',
    expectedOutcome: 'Monthly FBWT reconciliation completed within 10 business days of month-end.',
    responsibleParty: 'Jane Smith, CFO',
    responsibleOrg: 'DFAS Indianapolis',
    targetDate: '2025-12-31',
    milestones: [
      {
        title: 'Document reconciliation procedures',
        description: 'Create SOP for monthly FBWT reconciliation.',
        targetDate: '2025-06-30',
        responsible: 'Jane Smith',
        evidenceRequired: ['SOP document', 'Management approval memo'],
      },
      {
        title: 'Implement automated reconciliation tool',
        description: 'Deploy automated reconciliation in GFEBS.',
        targetDate: '2025-09-30',
        responsible: 'IT Team Lead',
        evidenceRequired: ['System configuration screenshots', 'UAT results'],
      },
      {
        title: 'Complete three months of reconciliation',
        description: 'Successfully perform three consecutive monthly reconciliations.',
        targetDate: '2025-12-31',
        responsible: 'Jane Smith',
        evidenceRequired: ['Reconciliation reports', 'Variance analysis'],
      },
    ],
    validationCriteria: [
      'Three consecutive months of successful FBWT reconciliation',
      'Variances below materiality threshold',
      'Management sign-off on process',
    ],
    ...overrides,
  };
}

/** Create a manager with a single CAP and return both. */
function createManagerWithCAP(
  overrides: Record<string, unknown> = {}
): { manager: CorrectiveActionPlanManager; cap: CorrectiveActionPlan } {
  const manager = new CorrectiveActionPlanManager();
  const cap = manager.createFromFinding(defaultCAPParams(overrides));
  return { manager, cap };
}

// ===========================================================================
// CorrectiveActionPlanManager
// ===========================================================================

describe('CorrectiveActionPlanManager', () => {
  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  describe('createFromFinding', () => {
    it('creates a CAP in draft status with milestones and validation criteria', () => {
      const { cap } = createManagerWithCAP();

      expect(cap.id).toBeTruthy();
      expect(cap.status).toBe('draft');
      expect(cap.engagementId).toBe('eng-1');
      expect(cap.findingId).toBe('finding-1');
      expect(cap.findingTitle).toContain('Fund Balance with Treasury');
      expect(cap.category).toBe('material_weakness');
      expect(cap.priority).toBe('high');
      expect(cap.deficiencyDescription).toBeTruthy();
      expect(cap.rootCause).toBeTruthy();
      expect(cap.correctiveAction).toBeTruthy();
      expect(cap.expectedOutcome).toBeTruthy();
      expect(cap.responsibleParty).toBe('Jane Smith, CFO');
      expect(cap.responsibleOrg).toBe('DFAS Indianapolis');
      expect(cap.targetDate).toBe('2025-12-31');
      expect(cap.createdDate).toBeTruthy();

      expect(cap.milestones).toHaveLength(3);
      expect(cap.milestones[0].title).toBe('Document reconciliation procedures');
      expect(cap.milestones[0].status).toBe('pending');
      expect(cap.milestones[0].evidenceProvided).toHaveLength(0);
      expect(cap.milestones[0].evidenceRequired).toHaveLength(2);

      expect(cap.validationCriteria).toHaveLength(3);
      expect(cap.evidence).toHaveLength(0);
      expect(cap.progressNotes).toHaveLength(0);
    });

    it('creates a CAP without milestones when none are provided', () => {
      const manager = new CorrectiveActionPlanManager();
      const cap = manager.createFromFinding({
        ...defaultCAPParams(),
        milestones: undefined,
        validationCriteria: undefined,
      });

      expect(cap.milestones).toHaveLength(0);
      expect(cap.validationCriteria).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle Transitions
  // -------------------------------------------------------------------------

  describe('lifecycle transitions', () => {
    it('follows the full lifecycle: draft -> active -> in_progress -> pending_validation -> closed', () => {
      const { manager, cap } = createManagerWithCAP();

      // draft -> active
      const activated = manager.activate(cap.id);
      expect(activated.status).toBe('active');

      // active -> in_progress
      const started = manager.startWork(cap.id, 'Beginning remediation work.');
      expect(started.status).toBe('in_progress');
      expect(started.progressNotes).toHaveLength(1);
      expect(started.progressNotes[0].note).toBe('Beginning remediation work.');

      // Complete all milestones
      for (const milestone of cap.milestones) {
        manager.updateMilestone(cap.id, milestone.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      // in_progress -> pending_validation
      const submitted = manager.submitForValidation(cap.id);
      expect(submitted.status).toBe('pending_validation');

      // pending_validation -> closed
      const validated = manager.validate(cap.id, 'Auditor A', 'passed');
      expect(validated.status).toBe('closed');
      expect(validated.closedDate).toBeTruthy();
      expect(validated.closedBy).toBe('Auditor A');
      expect(validated.validationResult).toBe('passed');
    });

    it('throws when activating a non-draft CAP', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);

      expect(() => manager.activate(cap.id)).toThrow('must be in draft');
    });

    it('throws when starting work on a non-active CAP', () => {
      const { manager, cap } = createManagerWithCAP();

      // Still in draft status
      expect(() => manager.startWork(cap.id)).toThrow('must be active');
    });

    it('throws when submitting for validation from wrong status', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);

      // in active status, not in_progress
      expect(() => manager.submitForValidation(cap.id)).toThrow('must be in_progress');
    });

    it('throws when validating a non-pending_validation CAP', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      expect(() => manager.validate(cap.id, 'Auditor A', 'passed')).toThrow(
        'must be pending_validation'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Milestone Management
  // -------------------------------------------------------------------------

  describe('milestone management', () => {
    it('updates milestone status and completion date', () => {
      const { manager, cap } = createManagerWithCAP();
      const milestone = cap.milestones[0];

      const updated = manager.updateMilestone(cap.id, milestone.id, {
        status: 'in_progress',
      });

      expect(updated.status).toBe('in_progress');

      const completed = manager.updateMilestone(cap.id, milestone.id, {
        status: 'completed',
        completedDate: '2025-06-15T00:00:00Z',
      });

      expect(completed.status).toBe('completed');
      expect(completed.completedDate).toBe('2025-06-15T00:00:00Z');
    });

    it('appends evidence to a milestone', () => {
      const { manager, cap } = createManagerWithCAP();
      const milestone = cap.milestones[0];

      manager.updateMilestone(cap.id, milestone.id, {
        evidenceProvided: ['SOP-v1.pdf'],
      });

      expect(milestone.evidenceProvided).toContain('SOP-v1.pdf');

      manager.updateMilestone(cap.id, milestone.id, {
        evidenceProvided: ['Approval-memo.pdf'],
      });

      expect(milestone.evidenceProvided).toHaveLength(2);
      expect(milestone.evidenceProvided).toContain('Approval-memo.pdf');
    });

    it('throws when updating a nonexistent milestone', () => {
      const { manager, cap } = createManagerWithCAP();

      expect(() =>
        manager.updateMilestone(cap.id, 'nonexistent-milestone', { status: 'completed' })
      ).toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // Evidence Management
  // -------------------------------------------------------------------------

  describe('evidence management', () => {
    it('adds evidence to a CAP with unverified status', () => {
      const { manager, cap } = createManagerWithCAP();

      const evidence = manager.addEvidence(cap.id, {
        title: 'FBWT Reconciliation SOP',
        description: 'Standard operating procedure for monthly FBWT reconciliation.',
        documentType: 'procedure',
        uploadedBy: 'Jane Smith',
        uploadedDate: '2025-05-15T00:00:00Z',
        filePath: '/docs/fbwt-sop-v1.pdf',
      });

      expect(evidence.id).toBeTruthy();
      expect(evidence.verified).toBe(false);
      expect(evidence.verifiedBy).toBeUndefined();
      expect(evidence.title).toBe('FBWT Reconciliation SOP');
      expect(cap.evidence).toHaveLength(1);
    });

    it('verifies evidence with verifier details', () => {
      const { manager, cap } = createManagerWithCAP();

      const evidence = manager.addEvidence(cap.id, {
        title: 'UAT Results',
        description: 'User acceptance test results for reconciliation tool.',
        documentType: 'test_result',
        uploadedBy: 'IT Team Lead',
        uploadedDate: '2025-08-01T00:00:00Z',
      });

      const verified = manager.verifyEvidence(cap.id, evidence.id, 'Auditor B');

      expect(verified.verified).toBe(true);
      expect(verified.verifiedBy).toBe('Auditor B');
      expect(verified.verifiedDate).toBeTruthy();
    });

    it('throws when verifying nonexistent evidence', () => {
      const { manager, cap } = createManagerWithCAP();

      expect(() => manager.verifyEvidence(cap.id, 'nonexistent-evidence', 'Auditor')).toThrow(
        'not found'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Progress Notes
  // -------------------------------------------------------------------------

  describe('progress notes', () => {
    it('adds progress notes with date and author', () => {
      const { manager, cap } = createManagerWithCAP();

      manager.addProgressNote(cap.id, 'Jane Smith', 'Drafted SOP document; awaiting review.');
      manager.addProgressNote(cap.id, 'LTC Johnson', 'Reviewed SOP; minor revisions needed.');

      expect(cap.progressNotes).toHaveLength(2);
      expect(cap.progressNotes[0].author).toBe('Jane Smith');
      expect(cap.progressNotes[0].note).toContain('Drafted SOP');
      expect(cap.progressNotes[0].date).toBeTruthy();
      expect(cap.progressNotes[1].author).toBe('LTC Johnson');
    });
  });

  // -------------------------------------------------------------------------
  // Submit for Validation
  // -------------------------------------------------------------------------

  describe('submitForValidation', () => {
    it('fails when milestones are incomplete', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      // Only complete the first milestone
      manager.updateMilestone(cap.id, cap.milestones[0].id, {
        status: 'completed',
        completedDate: new Date().toISOString(),
      });

      expect(() => manager.submitForValidation(cap.id)).toThrow(
        '2 milestone(s) incomplete'
      );
    });

    it('succeeds when all milestones are completed', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      for (const ms of cap.milestones) {
        manager.updateMilestone(cap.id, ms.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      const submitted = manager.submitForValidation(cap.id);
      expect(submitted.status).toBe('pending_validation');
    });

    it('lists incomplete milestone titles in the error message', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      // Complete none of the milestones
      try {
        manager.submitForValidation(cap.id);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).toContain('Document reconciliation procedures');
        expect(msg).toContain('Implement automated reconciliation tool');
        expect(msg).toContain('Complete three months of reconciliation');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('closes CAP on passed validation', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      for (const ms of cap.milestones) {
        manager.updateMilestone(cap.id, ms.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      manager.submitForValidation(cap.id);
      const result = manager.validate(cap.id, 'IG Auditor', 'passed');

      expect(result.status).toBe('closed');
      expect(result.closedDate).toBeTruthy();
      expect(result.closedBy).toBe('IG Auditor');
      expect(result.validationResult).toBe('passed');
      expect(result.validationDate).toBeTruthy();
    });

    it('sends CAP back to in_progress on failed validation', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      for (const ms of cap.milestones) {
        manager.updateMilestone(cap.id, ms.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      manager.submitForValidation(cap.id);
      const result = manager.validate(
        cap.id,
        'IG Auditor',
        'failed',
        'Reconciliation variances still exceed threshold.'
      );

      expect(result.status).toBe('in_progress');
      expect(result.validationResult).toBe('failed');
      expect(result.progressNotes.some((n) => n.note.includes('Validation failed'))).toBe(true);
      expect(result.progressNotes.some((n) => n.note.includes('variances'))).toBe(true);
    });

    it('sends CAP back to in_progress on partial validation', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      for (const ms of cap.milestones) {
        manager.updateMilestone(cap.id, ms.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      manager.submitForValidation(cap.id);
      const result = manager.validate(
        cap.id,
        'IG Auditor',
        'partial',
        'Process documentation adequate but system controls insufficient.'
      );

      expect(result.status).toBe('in_progress');
      expect(result.validationResult).toBe('partial');
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('cancels an active CAP with reason', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);

      const cancelled = manager.cancel(cap.id, 'Director', 'Finding superseded by new audit.');
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.closedDate).toBeTruthy();
      expect(cancelled.closedBy).toBe('Director');
      expect(cancelled.progressNotes.some((n) => n.note.includes('CAP cancelled'))).toBe(true);
      expect(cancelled.progressNotes.some((n) => n.note.includes('superseded'))).toBe(true);
    });

    it('throws when cancelling a closed CAP', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);
      manager.startWork(cap.id);

      for (const ms of cap.milestones) {
        manager.updateMilestone(cap.id, ms.id, {
          status: 'completed',
          completedDate: new Date().toISOString(),
        });
      }

      manager.submitForValidation(cap.id);
      manager.validate(cap.id, 'IG Auditor', 'passed');

      expect(() => manager.cancel(cap.id, 'Director', 'Test')).toThrow('Cannot cancel a closed CAP');
    });

    it('allows cancellation from draft status', () => {
      const { manager, cap } = createManagerWithCAP();

      const cancelled = manager.cancel(cap.id, 'Director', 'Finding withdrawn.');
      expect(cancelled.status).toBe('cancelled');
    });
  });

  // -------------------------------------------------------------------------
  // Summary Statistics
  // -------------------------------------------------------------------------

  describe('getSummary', () => {
    it('returns correct summary statistics for multiple CAPs', () => {
      const manager = new CorrectiveActionPlanManager();

      // Create CAPs with different statuses and priorities
      const cap1 = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-1',
        findingTitle: 'MW: FBWT',
        category: 'material_weakness',
        priority: 'critical',
      }));
      const cap2 = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-2',
        findingTitle: 'SD: Contract Payments',
        category: 'significant_deficiency',
        priority: 'high',
      }));
      const cap3 = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-3',
        findingTitle: 'NC: Travel Card',
        category: 'non_compliance',
        priority: 'medium',
      }));

      manager.activate(cap1.id);
      manager.activate(cap2.id);

      manager.startWork(cap1.id);

      const summary = manager.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.byStatus.draft).toBe(1);
      expect(summary.byStatus.active).toBe(1);
      expect(summary.byStatus.in_progress).toBe(1);
      expect(summary.byStatus.closed).toBe(0);
      expect(summary.byPriority.critical).toBe(1);
      expect(summary.byPriority.high).toBe(1);
      expect(summary.byPriority.medium).toBe(1);
      expect(summary.byCategory.material_weakness).toBe(1);
      expect(summary.byCategory.significant_deficiency).toBe(1);
      expect(summary.byCategory.non_compliance).toBe(1);
      expect(summary.closureRate).toBe(0);
    });

    it('returns zero summary for empty manager', () => {
      const manager = new CorrectiveActionPlanManager();
      const summary = manager.getSummary();

      expect(summary.total).toBe(0);
      expect(summary.averageAgeDays).toBe(0);
      expect(summary.closureRate).toBe(0);
      expect(summary.overdue).toBe(0);
      expect(summary.closedThisPeriod).toBe(0);
    });

    it('counts overdue CAPs based on target date', () => {
      const manager = new CorrectiveActionPlanManager();

      // Create a CAP with a past target date
      const cap = manager.createFromFinding(defaultCAPParams({
        targetDate: '2020-01-01', // well in the past
      }));
      manager.activate(cap.id);

      const summary = manager.getSummary();

      expect(summary.overdue).toBe(1);
    });

    it('calculates closure rate correctly', () => {
      const manager = new CorrectiveActionPlanManager();

      const cap1 = manager.createFromFinding(defaultCAPParams({ findingId: 'f-1' }));
      const cap2 = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-2',
        milestones: [],
      }));

      // Close cap2 through full lifecycle
      manager.activate(cap2.id);
      manager.startWork(cap2.id);
      manager.submitForValidation(cap2.id);
      manager.validate(cap2.id, 'Auditor', 'passed');

      const summary = manager.getSummary();

      // 1 closed out of 2 = 50%
      expect(summary.closureRate).toBe(50);
      expect(summary.closedThisPeriod).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Aging Report
  // -------------------------------------------------------------------------

  describe('getAgingReport', () => {
    it('returns aging data for active CAPs, sorted by days until due', () => {
      const manager = new CorrectiveActionPlanManager();

      const capSoon = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-soon',
        findingTitle: 'Due Soon',
        targetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'high',
      }));
      const capLater = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-later',
        findingTitle: 'Due Later',
        targetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'medium',
      }));
      const capOverdue = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-overdue',
        findingTitle: 'Overdue Item',
        targetDate: '2020-01-01',
        priority: 'critical',
      }));

      manager.activate(capSoon.id);
      manager.activate(capLater.id);
      manager.activate(capOverdue.id);

      const report = manager.getAgingReport();

      expect(report.length).toBe(3);

      // Sorted by daysUntilDue ascending (most overdue first)
      expect(report[0].findingTitle).toBe('Overdue Item');
      expect(report[0].isOverdue).toBe(true);
      expect(report[0].daysUntilDue).toBeLessThan(0);

      expect(report[1].findingTitle).toBe('Due Soon');
      expect(report[1].isOverdue).toBe(false);

      expect(report[2].findingTitle).toBe('Due Later');
      expect(report[2].isOverdue).toBe(false);
    });

    it('excludes closed and cancelled CAPs from aging report', () => {
      const manager = new CorrectiveActionPlanManager();

      const capActive = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-active',
        findingTitle: 'Active CAP',
      }));
      const capClosed = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-closed',
        findingTitle: 'Closed CAP',
        milestones: [],
      }));
      const capCancelled = manager.createFromFinding(defaultCAPParams({
        findingId: 'f-cancelled',
        findingTitle: 'Cancelled CAP',
      }));

      manager.activate(capActive.id);

      // Close one
      manager.activate(capClosed.id);
      manager.startWork(capClosed.id);
      manager.submitForValidation(capClosed.id);
      manager.validate(capClosed.id, 'Auditor', 'passed');

      // Cancel one
      manager.cancel(capCancelled.id, 'Director', 'Withdrawn');

      const report = manager.getAgingReport();

      expect(report.length).toBe(1);
      expect(report[0].findingTitle).toBe('Active CAP');
    });

    it('calculates completion percentage based on milestones', () => {
      const { manager, cap } = createManagerWithCAP();
      manager.activate(cap.id);

      // Complete 1 of 3 milestones
      manager.updateMilestone(cap.id, cap.milestones[0].id, {
        status: 'completed',
        completedDate: new Date().toISOString(),
      });

      const report = manager.getAgingReport();

      expect(report).toHaveLength(1);
      expect(report[0].completionPct).toBeCloseTo(33.33, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Overdue Milestone Detection
  // -------------------------------------------------------------------------

  describe('checkOverdueMilestones', () => {
    it('detects overdue milestones and updates their status', () => {
      const manager = new CorrectiveActionPlanManager();
      const cap = manager.createFromFinding(defaultCAPParams({
        milestones: [
          {
            title: 'Past due milestone',
            description: 'This milestone is overdue.',
            targetDate: '2020-01-01',
            responsible: 'Responsible Party',
            evidenceRequired: ['Evidence'],
          },
          {
            title: 'Future milestone',
            description: 'This milestone is in the future.',
            targetDate: '2099-12-31',
            responsible: 'Responsible Party',
            evidenceRequired: ['Evidence'],
          },
        ],
      }));

      manager.activate(cap.id);

      const overdue = manager.checkOverdueMilestones();

      expect(overdue).toHaveLength(1);
      expect(overdue[0].capId).toBe(cap.id);
      expect(overdue[0].milestone.title).toBe('Past due milestone');
      expect(overdue[0].milestone.status).toBe('overdue');

      // Verify the future milestone is unchanged
      const futureMilestone = cap.milestones.find((m) => m.title === 'Future milestone');
      expect(futureMilestone!.status).toBe('pending');
    });

    it('does not flag completed milestones as overdue', () => {
      const manager = new CorrectiveActionPlanManager();
      const cap = manager.createFromFinding(defaultCAPParams({
        milestones: [
          {
            title: 'Completed past milestone',
            description: 'Done already.',
            targetDate: '2020-01-01',
            responsible: 'Person',
            evidenceRequired: [],
          },
        ],
      }));

      manager.updateMilestone(cap.id, cap.milestones[0].id, {
        status: 'completed',
        completedDate: '2020-01-01',
      });

      const overdue = manager.checkOverdueMilestones();

      expect(overdue).toHaveLength(0);
    });

    it('skips milestones in closed and cancelled CAPs', () => {
      const manager = new CorrectiveActionPlanManager();
      const cap = manager.createFromFinding(defaultCAPParams({
        milestones: [
          {
            title: 'Past due',
            description: 'Overdue but CAP is cancelled.',
            targetDate: '2020-01-01',
            responsible: 'Person',
            evidenceRequired: [],
          },
        ],
      }));

      manager.cancel(cap.id, 'Director', 'Withdrawn');

      const overdue = manager.checkOverdueMilestones();

      expect(overdue).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Query Filters
  // -------------------------------------------------------------------------

  describe('getByEngagement and getByFinding', () => {
    it('filters CAPs by engagement ID', () => {
      const manager = new CorrectiveActionPlanManager();

      manager.createFromFinding(defaultCAPParams({ engagementId: 'eng-A', findingId: 'f-1' }));
      manager.createFromFinding(defaultCAPParams({ engagementId: 'eng-A', findingId: 'f-2' }));
      manager.createFromFinding(defaultCAPParams({ engagementId: 'eng-B', findingId: 'f-3' }));

      const engA = manager.getByEngagement('eng-A');
      const engB = manager.getByEngagement('eng-B');
      const engC = manager.getByEngagement('eng-C');

      expect(engA).toHaveLength(2);
      expect(engB).toHaveLength(1);
      expect(engC).toHaveLength(0);
    });

    it('filters CAPs by finding ID', () => {
      const manager = new CorrectiveActionPlanManager();

      manager.createFromFinding(defaultCAPParams({ findingId: 'f-X' }));
      manager.createFromFinding(defaultCAPParams({ findingId: 'f-X' }));
      manager.createFromFinding(defaultCAPParams({ findingId: 'f-Y' }));

      const findingX = manager.getByFinding('f-X');
      const findingY = manager.getByFinding('f-Y');
      const findingZ = manager.getByFinding('f-Z');

      expect(findingX).toHaveLength(2);
      expect(findingY).toHaveLength(1);
      expect(findingZ).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Other
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('throws for nonexistent CAP ID', () => {
      const manager = new CorrectiveActionPlanManager();

      expect(() => manager.findById('nonexistent')).toThrow('not found');
    });

    it('returns the correct CAP', () => {
      const { manager, cap } = createManagerWithCAP();
      const found = manager.findById(cap.id);

      expect(found.id).toBe(cap.id);
      expect(found.findingTitle).toBe(cap.findingTitle);
    });
  });

  describe('getAll', () => {
    it('returns a copy of all plans', () => {
      const manager = new CorrectiveActionPlanManager();

      manager.createFromFinding(defaultCAPParams({ findingId: 'f-1' }));
      manager.createFromFinding(defaultCAPParams({ findingId: 'f-2' }));

      const all = manager.getAll();
      expect(all).toHaveLength(2);

      // Verify it is a copy (not the internal array)
      all.pop();
      expect(manager.getAll()).toHaveLength(2);
    });
  });

  describe('constructor with existing plans', () => {
    it('initializes manager with existing plans', () => {
      const manager1 = new CorrectiveActionPlanManager();
      const cap1 = manager1.createFromFinding(defaultCAPParams({ findingId: 'f-1' }));
      const cap2 = manager1.createFromFinding(defaultCAPParams({ findingId: 'f-2' }));

      const existingPlans = manager1.getAll();
      const manager2 = new CorrectiveActionPlanManager(existingPlans);

      expect(manager2.getAll()).toHaveLength(2);
      expect(manager2.findById(cap1.id).findingId).toBe('f-1');
      expect(manager2.findById(cap2.id).findingId).toBe('f-2');
    });
  });
});
