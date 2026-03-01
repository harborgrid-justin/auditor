/**
 * NIST 800-53 Control Mapping
 *
 * Maps application features and security controls to NIST SP 800-53
 * Rev. 5 control families. This mapping is required for the System
 * Security Plan (SSP) and Authority to Operate (ATO) documentation.
 *
 * Control families covered:
 *   - AC: Access Control
 *   - AU: Audit and Accountability
 *   - IA: Identification and Authentication
 *   - SC: System and Communications Protection
 *   - SI: System and Information Integrity
 *   - CM: Configuration Management
 *   - CP: Contingency Planning
 *   - MP: Media Protection
 *   - PE: Physical and Environmental Protection (documented, not app-level)
 *
 * References:
 *   - NIST SP 800-53 Rev. 5: Security and Privacy Controls
 *   - NIST SP 800-171 Rev. 2: Protecting CUI in Nonfederal Systems
 *   - DoDI 8510.01: Risk Management Framework (RMF) for DoD IT
 *   - CNSSI 1253: Security Categorization and Control Selection
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ControlFamily =
  | 'AC' | 'AU' | 'IA' | 'SC' | 'SI'
  | 'CM' | 'CP' | 'MP' | 'PE' | 'PM'
  | 'RA' | 'CA' | 'PL' | 'PS' | 'SA'
  | 'AT' | 'IR' | 'MA' | 'PT' | 'SR';

export type ControlStatus = 'implemented' | 'partially_implemented' | 'planned' | 'not_applicable' | 'not_implemented';

export interface NISTControl {
  controlId: string;
  family: ControlFamily;
  title: string;
  description: string;
  implementationStatus: ControlStatus;
  implementationDetails: string;
  applicationFeature?: string;
  evidence?: string;
}

export interface ControlCoverageReport {
  totalControls: number;
  implemented: number;
  partiallyImplemented: number;
  planned: number;
  notApplicable: number;
  notImplemented: number;
  coveragePercentage: number;
  byFamily: Record<string, {
    total: number;
    implemented: number;
    percentage: number;
  }>;
  gaps: NISTControl[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Control Mapping
// ---------------------------------------------------------------------------

const NIST_CONTROLS: NISTControl[] = [
  // === Access Control (AC) ===
  {
    controlId: 'AC-2',
    family: 'AC',
    title: 'Account Management',
    description: 'Manage system accounts, including establishing, activating, modifying, reviewing, disabling, and removing accounts.',
    implementationStatus: 'implemented',
    implementationDetails: 'User account management via NextAuth with role-based access (admin, auditor, reviewer, viewer). DoD-specific roles (certifying_officer, disbursing_officer, etc.) enforced via guard.ts.',
    applicationFeature: 'src/lib/auth/guard.ts',
    evidence: 'User role assignment, engagement membership controls',
  },
  {
    controlId: 'AC-3',
    family: 'AC',
    title: 'Access Enforcement',
    description: 'Enforce approved authorizations for logical access to information and system resources.',
    implementationStatus: 'implemented',
    implementationDetails: 'Role-based access control enforced at API route level. Engagement-level isolation via requireEngagementMember(). DoD role checks via requireDoDRole().',
    applicationFeature: 'src/lib/auth/guard.ts',
    evidence: 'API route guards, middleware checks',
  },
  {
    controlId: 'AC-5',
    family: 'AC',
    title: 'Separation of Duties',
    description: 'Separate duties of individuals to prevent malicious activity.',
    implementationStatus: 'implemented',
    implementationDetails: 'SoD enforcement engine prevents certifying officers from certifying own disbursements, investigators from self-investigation, etc.',
    applicationFeature: 'src/lib/security/separation-of-duties.ts',
    evidence: 'SoD rule engine with 8 defined conflict rules',
  },
  {
    controlId: 'AC-6',
    family: 'AC',
    title: 'Least Privilege',
    description: 'Employ the principle of least privilege.',
    implementationStatus: 'implemented',
    implementationDetails: 'Role hierarchy (viewer < auditor < reviewer < admin) with minimum necessary access. DoD-specific roles for financial operations.',
    applicationFeature: 'src/lib/auth/guard.ts',
  },
  {
    controlId: 'AC-7',
    family: 'AC',
    title: 'Unsuccessful Logon Attempts',
    description: 'Enforce a limit of consecutive invalid logon attempts.',
    implementationStatus: 'planned',
    implementationDetails: 'Account lockout after 3 failed attempts planned for implementation.',
  },
  {
    controlId: 'AC-8',
    family: 'AC',
    title: 'System Use Notification',
    description: 'Display system use notification message or banner.',
    implementationStatus: 'implemented',
    implementationDetails: 'CUI classification banners displayed on all pages containing controlled information.',
    applicationFeature: 'src/lib/security/data-classification.ts',
  },
  {
    controlId: 'AC-11',
    family: 'AC',
    title: 'Device Lock',
    description: 'Prevent access after a period of inactivity by initiating a session lock.',
    implementationStatus: 'implemented',
    implementationDetails: 'Session timeout after 15 minutes idle, 8 hours maximum session per NIST guidelines.',
    applicationFeature: 'src/lib/auth/session-manager.ts',
  },
  {
    controlId: 'AC-12',
    family: 'AC',
    title: 'Session Termination',
    description: 'Automatically terminate a user session after conditions are met.',
    implementationStatus: 'implemented',
    implementationDetails: 'Automatic session termination on idle timeout and maximum session duration.',
    applicationFeature: 'src/lib/auth/session-manager.ts',
  },

  // === Audit and Accountability (AU) ===
  {
    controlId: 'AU-2',
    family: 'AU',
    title: 'Event Logging',
    description: 'Identify events that the system is capable of logging.',
    implementationStatus: 'implemented',
    implementationDetails: 'Immutable audit log captures all API operations via NestJS interceptor. Includes user, action, timestamp, and entity details.',
    applicationFeature: 'server/src/common/interceptors/audit-trail.interceptor.ts',
    evidence: 'Audit log entries in database',
  },
  {
    controlId: 'AU-3',
    family: 'AU',
    title: 'Content of Audit Records',
    description: 'Ensure audit records contain sufficient information.',
    implementationStatus: 'implemented',
    implementationDetails: 'Audit records include: what, when, where, source, outcome, and identity. Winston logger provides structured output.',
    applicationFeature: 'server/src/common/logger/winston.logger.ts',
  },
  {
    controlId: 'AU-6',
    family: 'AU',
    title: 'Audit Record Review, Analysis, and Reporting',
    description: 'Review and analyze system audit records.',
    implementationStatus: 'partially_implemented',
    implementationDetails: 'Audit logs are captured and stored. Automated review/alerting via escalation engine for specific events (ADA violations, overdue CAPs).',
    applicationFeature: 'server/src/notifications/escalation.service.ts',
  },

  // === Identification and Authentication (IA) ===
  {
    controlId: 'IA-2',
    family: 'IA',
    title: 'Identification and Authentication (Organizational Users)',
    description: 'Uniquely identify and authenticate organizational users.',
    implementationStatus: 'implemented',
    implementationDetails: 'NextAuth authentication with bcrypt password hashing. JWT session tokens.',
    applicationFeature: 'src/lib/auth/index.ts',
  },
  {
    controlId: 'IA-5',
    family: 'IA',
    title: 'Authenticator Management',
    description: 'Manage system authenticators.',
    implementationStatus: 'implemented',
    implementationDetails: 'Password hashing via bcrypt. Session tokens managed by NextAuth.',
    applicationFeature: 'src/lib/auth/index.ts',
  },

  // === System and Communications Protection (SC) ===
  {
    controlId: 'SC-8',
    family: 'SC',
    title: 'Transmission Confidentiality and Integrity',
    description: 'Protect the confidentiality and integrity of transmitted information.',
    implementationStatus: 'implemented',
    implementationDetails: 'HTTPS enforced for all communications. Application deployed behind TLS-terminating proxy.',
  },
  {
    controlId: 'SC-13',
    family: 'SC',
    title: 'Cryptographic Protection',
    description: 'Implement cryptographic mechanisms.',
    implementationStatus: 'implemented',
    implementationDetails: 'AES-256-GCM field-level encryption for sensitive data. FIPS-approved algorithms.',
    applicationFeature: 'src/lib/security/encryption.ts',
    evidence: 'Encrypted field storage in database',
  },
  {
    controlId: 'SC-28',
    family: 'SC',
    title: 'Protection of Information at Rest',
    description: 'Protect the confidentiality and integrity of information at rest.',
    implementationStatus: 'implemented',
    implementationDetails: 'Field-level AES-256-GCM encryption for PII fields. PostgreSQL TDE recommended for production deployment.',
    applicationFeature: 'src/lib/security/encryption.ts',
  },

  // === System and Information Integrity (SI) ===
  {
    controlId: 'SI-4',
    family: 'SI',
    title: 'System Monitoring',
    description: 'Monitor the system to detect attacks and unauthorized connections.',
    implementationStatus: 'partially_implemented',
    implementationDetails: 'Application-level monitoring via continuous monitoring dashboard. Infrastructure-level monitoring delegated to deployment platform.',
    applicationFeature: 'src/lib/engine/federal-accounting/continuous-monitoring.ts',
  },
  {
    controlId: 'SI-10',
    family: 'SI',
    title: 'Information Input Validation',
    description: 'Check the validity of information inputs.',
    implementationStatus: 'implemented',
    implementationDetails: 'Zod schema validation on all API inputs. Type-safe DTOs for NestJS backend.',
    applicationFeature: 'src/lib/validation/schemas.ts',
    evidence: 'Zod schemas, NestJS DTOs',
  },

  // === Configuration Management (CM) ===
  {
    controlId: 'CM-3',
    family: 'CM',
    title: 'Configuration Change Control',
    description: 'Implement and manage configuration change control.',
    implementationStatus: 'implemented',
    implementationDetails: 'Git-based version control. CI/CD pipeline with automated testing. Rule version history tracking.',
    applicationFeature: '.github/workflows/ci.yml',
    evidence: 'Git history, CI pipeline logs',
  },

  // === Media Protection (MP) ===
  {
    controlId: 'MP-4',
    family: 'MP',
    title: 'Media Storage',
    description: 'Physically control and securely store media.',
    implementationStatus: 'not_applicable',
    implementationDetails: 'Application is cloud-based. Physical media controls are the responsibility of the hosting environment.',
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the full control coverage report.
 *
 * @returns ControlCoverageReport with statistics and gaps
 */
export function getControlCoverage(): ControlCoverageReport {
  const implemented = NIST_CONTROLS.filter(c => c.implementationStatus === 'implemented').length;
  const partial = NIST_CONTROLS.filter(c => c.implementationStatus === 'partially_implemented').length;
  const planned = NIST_CONTROLS.filter(c => c.implementationStatus === 'planned').length;
  const notApplicable = NIST_CONTROLS.filter(c => c.implementationStatus === 'not_applicable').length;
  const notImplemented = NIST_CONTROLS.filter(c => c.implementationStatus === 'not_implemented').length;

  const applicable = NIST_CONTROLS.length - notApplicable;
  const coveragePercentage = applicable > 0
    ? Math.round(((implemented + partial * 0.5) / applicable) * 100)
    : 0;

  // Coverage by family
  const byFamily: Record<string, { total: number; implemented: number; percentage: number }> = {};
  for (const control of NIST_CONTROLS) {
    if (!byFamily[control.family]) {
      byFamily[control.family] = { total: 0, implemented: 0, percentage: 0 };
    }
    byFamily[control.family].total++;
    if (control.implementationStatus === 'implemented') {
      byFamily[control.family].implemented++;
    }
  }
  for (const family of Object.values(byFamily)) {
    family.percentage = family.total > 0
      ? Math.round((family.implemented / family.total) * 100)
      : 0;
  }

  // Gaps: controls that are not implemented or only planned
  const gaps = NIST_CONTROLS.filter(
    c => c.implementationStatus === 'not_implemented' ||
         c.implementationStatus === 'planned',
  );

  return {
    totalControls: NIST_CONTROLS.length,
    implemented,
    partiallyImplemented: partial,
    planned,
    notApplicable,
    notImplemented,
    coveragePercentage,
    byFamily,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get controls filtered by family.
 */
export function getControlsByFamily(family: ControlFamily): NISTControl[] {
  return NIST_CONTROLS.filter(c => c.family === family);
}

/**
 * Identify control gaps (unimplemented or planned controls).
 */
export function identifyControlGaps(): NISTControl[] {
  return NIST_CONTROLS.filter(
    c => c.implementationStatus === 'not_implemented' ||
         c.implementationStatus === 'planned',
  );
}

/**
 * Get all controls.
 */
export function getAllControls(): NISTControl[] {
  return [...NIST_CONTROLS];
}
