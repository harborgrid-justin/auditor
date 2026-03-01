import { z } from 'zod';

export const AnalyzeRequestSchema = z.object({
  engagementId: z.string().min(1, 'engagementId is required'),
  frameworks: z
    .array(z.enum(['GAAP', 'IRS', 'SOX', 'PCAOB']))
    .optional(),
});

export const EngagementCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  entityName: z.string().min(1, 'Entity name is required').max(255),
  fiscalYearEnd: z.string().min(1, 'Fiscal year end is required'),
  materialityThreshold: z.number().min(0).optional().default(0),
  industry: z.string().max(100).nullable().optional(),
  entityType: z
    .enum(['c_corp', 's_corp', 'partnership', 'llc', 'nonprofit'])
    .nullable()
    .optional(),
  templateId: z.string().optional(),
});

export const EngagementUpdateSchema = z.object({
  status: z
    .enum(['planning', 'fieldwork', 'review', 'completed', 'archived'])
    .optional(),
  materialityThreshold: z.number().min(0).optional(),
});

export const FindingUpdateSchema = z.object({
  id: z.string().min(1, 'Finding id is required'),
  status: z.enum(['open', 'resolved', 'accepted', 'in_review', 'reviewer_approved', 'reviewer_rejected']),
  comment: z.string().max(2000).optional(),
});

export const UploadMetaSchema = z.object({
  engagementId: z.string().min(1),
  dataType: z.enum([
    'trial_balance',
    'journal_entries',
    'financial_statements',
    'tax_returns',
    'other',
  ]),
});

export const CommentCreateSchema = z.object({
  findingId: z.string().min(1),
  engagementId: z.string().min(1),
  comment: z.string().min(1).max(5000),
});

export const SignoffCreateSchema = z.object({
  engagementId: z.string().min(1),
  entityType: z.enum(['finding', 'control', 'engagement']),
  entityId: z.string().min(1),
  opinion: z.string().max(2000).optional(),
});

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  entityType: z
    .enum(['c_corp', 's_corp', 'partnership', 'llc', 'nonprofit'])
    .nullable()
    .optional(),
  industry: z.string().max(100).nullable().optional(),
  defaultMateriality: z.number().min(0).optional().default(0),
  frameworksJson: z.string().optional(),
  soxControlsJson: z.string().optional(),
});

export const ScheduleCreateSchema = z.object({
  engagementId: z.string().min(1),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1).max(100),
  frameworks: z.array(z.enum(['GAAP', 'IRS', 'SOX', 'PCAOB'])).min(1),
  enabled: z.boolean().optional().default(true),
});

export const AuditLogQuerySchema = z.object({
  engagementId: z.string().optional(),
  action: z.enum(['create', 'read', 'update', 'delete', 'analyze', 'export', 'upload', 'login', 'logout']).optional(),
  entityType: z.enum(['engagement', 'finding', 'control', 'file', 'journal_entry', 'user', 'template', 'schedule', 'signoff', 'workpaper']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Validate request data against a Zod schema.
 * Returns parsed data on success or a NextResponse error on failure.
 */
export function validateRequest<T>(
  schema: z.ZodType<T>,
  data: unknown
): { data: T; error?: never } | { data?: never; error: { message: string; issues: z.ZodIssue[] } } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      error: {
        message: 'Validation failed',
        issues: result.error.issues,
      },
    };
  }
  return { data: result.data };
}
