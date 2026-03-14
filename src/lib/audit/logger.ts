import { db, schema } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'analyze'
  | 'export'
  | 'upload'
  | 'login'
  | 'logout';

export type AuditEntityType =
  | 'engagement'
  | 'finding'
  | 'control'
  | 'file'
  | 'journal_entry'
  | 'user'
  | 'template'
  | 'schedule'
  | 'signoff'
  | 'workpaper'
  | 'appropriation'
  | 'obligation'
  | 'disbursement'
  | 'ada_violation'
  | 'travel_order'
  | 'contract_payment'
  | 'interagency_agreement'
  | 'batch_job'
  | 'budget_formulation'
  | 'corrective_action_plan'
  | 'debt'
  | 'evidence_package'
  | 'financial_statement'
  | 'igt_reconciliation'
  | 'lease'
  | 'monitoring_alert'
  | 'organization'
  | 'reconciliation'
  | 'security_cooperation_case'
  | 'special_account'
  | 'workflow_instance';

export interface AuditLogParams {
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  engagementId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Log an immutable audit event. All audit logs are append-only.
 */
export function logAuditEvent(params: AuditLogParams): void {
  try {
    db.insert(schema.auditLogs)
      .values({
        id: uuid(),
        engagementId: params.engagementId || null,
        userId: params.userId,
        userName: params.userName,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress || null,
        timestamp: new Date().toISOString(),
      })
      .run();
  } catch (error) {
    // Audit logging should never break the main request
    console.error('Audit log error:', error);
  }
}

/**
 * Log a finding field change to the history table.
 */
export function logFindingChange(
  findingId: string,
  engagementId: string,
  changedBy: string,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null
): void {
  try {
    db.insert(schema.findingHistory)
      .values({
        id: uuid(),
        findingId,
        engagementId,
        changedBy,
        fieldChanged,
        oldValue,
        newValue,
        changedAt: new Date().toISOString(),
      })
      .run();
  } catch (error) {
    console.error('Finding history log error:', error);
  }
}
