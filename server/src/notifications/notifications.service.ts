import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../database/database.module';

export type NotificationType =
  | 'ada_violation'
  | 'finding_assigned'
  | 'finding_status_changed'
  | 'legislation_sunset'
  | 'cap_overdue'
  | 'signoff_required'
  | 'report_ready'
  | 'job_completed'
  | 'system';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  engagementId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByUser(userId: string, unreadOnly = false) {
    const { notifications } = await import('@shared/lib/db/pg-schema');
    let query = this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    if (unreadOnly) {
      query = this.db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
        .orderBy(desc(notifications.createdAt));
    }

    return query;
  }

  async create(params: CreateNotificationParams) {
    const { notifications } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(notifications).values({
      id,
      userId: params.userId,
      type: params.type,
      priority: params.priority,
      title: params.title,
      message: params.message,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      engagementId: params.engagementId ?? null,
      read: false,
      createdAt: now,
    });

    return { id, ...params, read: false, createdAt: now };
  }

  async markAsRead(id: string, userId: string) {
    const { notifications } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

    if (results.length === 0) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    await this.db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));

    return { ...results[0], read: true };
  }

  async markAllAsRead(userId: string) {
    const { notifications } = await import('@shared/lib/db/pg-schema');
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { notifications } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    return results.length;
  }

  // High-level notification helpers for specific events

  async notifyAdaViolation(params: {
    engagementId: string;
    violationId: string;
    amount: number;
    violationType: string;
    recipientUserIds: string[];
  }) {
    const results = [];
    for (const userId of params.recipientUserIds) {
      const notification = await this.create({
        userId,
        type: 'ada_violation',
        priority: 'critical',
        title: 'ADA Violation Detected',
        message: `Anti-Deficiency Act violation detected: ${params.violationType} — amount: $${params.amount.toLocaleString()}. Immediate investigation required per 31 U.S.C. §1351.`,
        entityType: 'ada_violation',
        entityId: params.violationId,
        engagementId: params.engagementId,
      });
      results.push(notification);
    }
    return results;
  }

  async notifyLegislationSunset(params: {
    legislationTitle: string;
    sunsetDate: string;
    daysUntilSunset: number;
    recipientUserIds: string[];
  }) {
    const results = [];
    for (const userId of params.recipientUserIds) {
      const notification = await this.create({
        userId,
        type: 'legislation_sunset',
        priority: params.daysUntilSunset <= 30 ? 'high' : 'normal',
        title: 'Legislation Sunset Approaching',
        message: `"${params.legislationTitle}" sunsets on ${params.sunsetDate} (${params.daysUntilSunset} days). Review affected rules and parameters.`,
      });
      results.push(notification);
    }
    return results;
  }

  async notifyCapOverdue(params: {
    engagementId: string;
    capId: string;
    findingTitle: string;
    responsibleUserId: string;
    daysOverdue: number;
  }) {
    return this.create({
      userId: params.responsibleUserId,
      type: 'cap_overdue',
      priority: params.daysOverdue > 30 ? 'high' : 'normal',
      title: 'Corrective Action Plan Overdue',
      message: `CAP for "${params.findingTitle}" is ${params.daysOverdue} days overdue. Please update progress or request extension.`,
      entityType: 'corrective_action_plan',
      entityId: params.capId,
      engagementId: params.engagementId,
    });
  }
}
