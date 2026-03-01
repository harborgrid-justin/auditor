/**
 * Notification Escalation Engine
 *
 * Time-based escalation of unacknowledged or unresolved notifications.
 * Designed to run on a cron schedule (e.g., every 15 minutes) to check
 * for notifications that require escalation per DoD FMR timelines.
 *
 * Escalation Rules:
 *   - ADA violation unacknowledged > 24h → component head
 *   - ADA violation unresolved > 48h → Inspector General
 *   - CAP overdue > 30 days → engagement lead
 *   - FBWT reconciliation difference unresolved > 5 days → financial manager
 *   - Approval step overdue > due date → next level authority
 *
 * References:
 *   - 31 U.S.C. §1351: ADA violation reporting requirements
 *   - OMB Circular A-123: Internal controls and corrective actions
 *   - DoD FMR Vol 4 Ch 2: FBWT reconciliation timelines
 */

import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN } from '../database/database.module';
import { NotificationsService, NotificationType, NotificationPriority } from './notifications.service';

// ---------------------------------------------------------------------------
// Escalation Rule Definitions
// ---------------------------------------------------------------------------

export interface EscalationRule {
  id: string;
  name: string;
  sourceType: NotificationType;
  triggerCondition: 'unacknowledged' | 'unresolved';
  thresholdHours: number;
  escalateToRole: string;
  escalationPriority: NotificationPriority;
  escalationMessage: string;
}

const DEFAULT_RULES: EscalationRule[] = [
  {
    id: 'ESC-ADA-24H',
    name: 'ADA Violation 24h Escalation',
    sourceType: 'ada_violation',
    triggerCondition: 'unacknowledged',
    thresholdHours: 24,
    escalateToRole: 'component_head',
    escalationPriority: 'critical',
    escalationMessage:
      'ADA violation has not been acknowledged within 24 hours. ' +
      'Immediate action required per 31 U.S.C. §1351.',
  },
  {
    id: 'ESC-ADA-48H',
    name: 'ADA Violation 48h IG Escalation',
    sourceType: 'ada_violation',
    triggerCondition: 'unresolved',
    thresholdHours: 48,
    escalateToRole: 'inspector_general',
    escalationPriority: 'critical',
    escalationMessage:
      'ADA violation remains unresolved after 48 hours. ' +
      'Inspector General notification required per 31 U.S.C. §1351.',
  },
  {
    id: 'ESC-CAP-30D',
    name: 'CAP 30-Day Overdue Escalation',
    sourceType: 'cap_overdue',
    triggerCondition: 'unresolved',
    thresholdHours: 720, // 30 days
    escalateToRole: 'engagement_lead',
    escalationPriority: 'high',
    escalationMessage:
      'Corrective Action Plan has been overdue for more than 30 days. ' +
      'Management review required per OMB Circular A-123.',
  },
  {
    id: 'ESC-FBWT-5D',
    name: 'FBWT Reconciliation 5-Day Escalation',
    sourceType: 'system',
    triggerCondition: 'unresolved',
    thresholdHours: 120, // 5 days
    escalateToRole: 'financial_manager',
    escalationPriority: 'high',
    escalationMessage:
      'FBWT reconciliation difference has remained unresolved for 5 days. ' +
      'Financial manager review required per DoD FMR Vol 4 Ch 2.',
  },
  {
    id: 'ESC-SIGNOFF-3D',
    name: 'Report Signoff 3-Day Escalation',
    sourceType: 'signoff_required',
    triggerCondition: 'unacknowledged',
    thresholdHours: 72, // 3 days
    escalateToRole: 'engagement_lead',
    escalationPriority: 'high',
    escalationMessage:
      'Report signoff has not been actioned within 3 business days. ' +
      'Escalating to engagement lead.',
  },
];

// ---------------------------------------------------------------------------
// Escalation Tracking
// ---------------------------------------------------------------------------

interface EscalationRecord {
  ruleId: string;
  originalNotificationId: string;
  escalatedNotificationId: string;
  escalatedAt: string;
  escalatedToUserId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EscalationService {
  private rules: EscalationRule[] = [...DEFAULT_RULES];
  private escalationLog: EscalationRecord[] = [];

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: any,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Add or override an escalation rule.
   */
  configureRule(rule: EscalationRule): void {
    const idx = this.rules.findIndex(r => r.id === rule.id);
    if (idx >= 0) {
      this.rules[idx] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * Remove an escalation rule.
   */
  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex(r => r.id === ruleId);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all configured rules.
   */
  getRules(): EscalationRule[] {
    return [...this.rules];
  }

  /**
   * Main escalation check — run on a cron schedule.
   *
   * Scans all unread notifications, checks each against escalation rules,
   * and creates escalation notifications for those that have exceeded
   * their time threshold.
   */
  async checkEscalations(): Promise<EscalationRecord[]> {
    const newEscalations: EscalationRecord[] = [];

    // For each rule, find matching unread notifications that have exceeded threshold
    for (const rule of this.rules) {
      const thresholdDate = new Date();
      thresholdDate.setHours(thresholdDate.getHours() - rule.thresholdHours);

      // Check unread notifications matching this rule's source type
      const candidates = await this.findCandidateNotifications(
        rule.sourceType,
        thresholdDate,
      );

      for (const candidate of candidates) {
        // Skip if already escalated by this rule
        const alreadyEscalated = this.escalationLog.some(
          e =>
            e.ruleId === rule.id &&
            e.originalNotificationId === candidate.id,
        );
        if (alreadyEscalated) continue;

        // Create escalation notification
        const escalationUserId = await this.resolveEscalationTarget(
          rule.escalateToRole,
          candidate.engagementId,
        );

        if (!escalationUserId) continue;

        const escalated = await this.notificationsService.create({
          userId: escalationUserId,
          type: rule.sourceType,
          priority: rule.escalationPriority,
          title: `[ESCALATED] ${candidate.title}`,
          message: `${rule.escalationMessage}\n\nOriginal: ${candidate.message}`,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          engagementId: candidate.engagementId,
        });

        const record: EscalationRecord = {
          ruleId: rule.id,
          originalNotificationId: candidate.id,
          escalatedNotificationId: escalated.id,
          escalatedAt: new Date().toISOString(),
          escalatedToUserId: escalationUserId,
        };

        this.escalationLog.push(record);
        newEscalations.push(record);
      }
    }

    return newEscalations;
  }

  /**
   * Get escalation history.
   */
  getEscalationLog(): EscalationRecord[] {
    return [...this.escalationLog];
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async findCandidateNotifications(
    type: NotificationType,
    beforeDate: Date,
  ): Promise<
    Array<{
      id: string;
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
      engagementId?: string;
      createdAt: string;
    }>
  > {
    try {
      const { notifications } = await import('@shared/lib/db/pg-schema');
      const { eq, and, lt } = await import('drizzle-orm');

      const results = await this.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, type),
            eq(notifications.read, false),
            lt(notifications.createdAt, beforeDate.toISOString()),
          ),
        );

      return results;
    } catch {
      // DB not available — return empty
      return [];
    }
  }

  private async resolveEscalationTarget(
    role: string,
    engagementId?: string,
  ): Promise<string | null> {
    // In production, look up users by role within the engagement.
    // For now, look for any user with the matching role.
    try {
      const { users } = await import('@shared/lib/db/pg-schema');
      const { eq } = await import('drizzle-orm');

      const candidates = await this.db
        .select()
        .from(users)
        .where(eq(users.role, role));

      if (candidates.length > 0) {
        return candidates[0].id;
      }
    } catch {
      // Fallback — no user found for role
    }

    return null;
  }
}
