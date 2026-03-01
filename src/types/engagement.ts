export type EngagementStatus = 'planning' | 'fieldwork' | 'review' | 'completed' | 'archived';
export type UserRole = 'admin' | 'auditor' | 'reviewer' | 'viewer';
export type EngagementRole = 'lead' | 'staff' | 'reviewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Engagement {
  id: string;
  name: string;
  entityName: string;
  fiscalYearEnd: string;
  status: EngagementStatus;
  materialityThreshold: number;
  createdBy: string;
  createdAt: string;
  industry?: string;
  entityType?: 'c_corp' | 's_corp' | 'partnership' | 'llc' | 'nonprofit' | 'dod_component' | 'defense_agency' | 'combatant_command' | 'working_capital_fund' | 'naf_entity';
}

export interface EngagementMember {
  id: string;
  engagementId: string;
  userId: string;
  role: EngagementRole;
  userName?: string;
  userEmail?: string;
}

export interface EngagementSummary extends Engagement {
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  filesUploaded: number;
  lastAnalysis: string | null;
  riskScore: number | null;
  complianceScore: number | null;
}
