import { describe, it, expect } from 'vitest';
import { canTransition, getAvailableTransitions } from '@/lib/workflow/finding-workflow';

describe('canTransition', () => {
  it('allows auditor to move open to in_review', () => {
    const result = canTransition('open', 'in_review', 'auditor');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows reviewer to approve in_review', () => {
    const result = canTransition('in_review', 'reviewer_approved', 'reviewer');

    expect(result.allowed).toBe(true);
  });

  it('allows reviewer to reject in_review', () => {
    const result = canTransition('in_review', 'reviewer_rejected', 'reviewer');

    expect(result.allowed).toBe(true);
  });

  it('does not allow viewer to make any transitions', () => {
    const transitions = [
      { from: 'open', to: 'in_review' },
      { from: 'in_review', to: 'reviewer_approved' },
      { from: 'in_review', to: 'reviewer_rejected' },
      { from: 'reviewer_rejected', to: 'in_review' },
      { from: 'reviewer_approved', to: 'resolved' },
      { from: 'reviewer_approved', to: 'accepted' },
      { from: 'resolved', to: 'open' },
      { from: 'accepted', to: 'open' },
    ];

    for (const t of transitions) {
      const result = canTransition(t.from, t.to, 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    }
  });

  it('allows admin to transition anything', () => {
    const transitions = [
      { from: 'open', to: 'in_review' },
      { from: 'in_review', to: 'reviewer_approved' },
      { from: 'in_review', to: 'reviewer_rejected' },
      { from: 'reviewer_rejected', to: 'in_review' },
      { from: 'reviewer_approved', to: 'resolved' },
      { from: 'reviewer_approved', to: 'accepted' },
      { from: 'resolved', to: 'open' },
      { from: 'accepted', to: 'open' },
    ];

    for (const t of transitions) {
      const result = canTransition(t.from, t.to, 'admin');
      expect(result.allowed).toBe(true);
    }
  });

  it('returns allowed: false for invalid transitions', () => {
    // open -> resolved is not a valid transition at all
    const result = canTransition('open', 'resolved', 'admin');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not allowed');
  });

  it('returns allowed: false when role is not permitted for a valid transition', () => {
    // open -> in_review is valid but only for auditor/admin, not reviewer
    const result = canTransition('open', 'in_review', 'reviewer');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Role');
  });
});

describe('getAvailableTransitions', () => {
  it('returns in_review for auditor with open status', () => {
    const transitions = getAvailableTransitions('open', 'auditor');

    expect(transitions).toEqual(['in_review']);
  });

  it('returns reviewer_approved and reviewer_rejected for reviewer with in_review status', () => {
    const transitions = getAvailableTransitions('in_review', 'reviewer');

    expect(transitions).toContain('reviewer_approved');
    expect(transitions).toContain('reviewer_rejected');
    expect(transitions).toHaveLength(2);
  });

  it('returns empty array for viewer at any status', () => {
    const statuses = ['open', 'in_review', 'reviewer_approved', 'reviewer_rejected', 'resolved', 'accepted'];

    for (const status of statuses) {
      const transitions = getAvailableTransitions(status, 'viewer');
      expect(transitions).toHaveLength(0);
    }
  });

  it('returns all possible transitions for admin', () => {
    const fromOpen = getAvailableTransitions('open', 'admin');
    expect(fromOpen).toEqual(['in_review']);

    const fromInReview = getAvailableTransitions('in_review', 'admin');
    expect(fromInReview).toContain('reviewer_approved');
    expect(fromInReview).toContain('reviewer_rejected');

    const fromApproved = getAvailableTransitions('reviewer_approved', 'admin');
    expect(fromApproved).toContain('resolved');
    expect(fromApproved).toContain('accepted');

    const fromResolved = getAvailableTransitions('resolved', 'admin');
    expect(fromResolved).toEqual(['open']);
  });
});
