/**
 * USAspending.gov DATA Act Submission Interface
 *
 * Defines the integration interface for submitting DATA Act files
 * to USAspending.gov's broker system. Agencies are required to submit
 * Files A–F quarterly to the DATA Act broker for certification.
 *
 * References:
 *   - Digital Accountability and Transparency Act of 2014 (P.L. 113-101)
 *   - DAIMS v2.0+ (DATA Act Information Model Schema)
 *   - OMB M-17-04: Additional guidance for DATA Act implementation
 *   - DoD FMR Vol 6B Ch 15: DATA Act compliance
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DATAActFileType =
  | 'A'    // Appropriations Account
  | 'B'    // Object Class & Program Activity
  | 'C'    // Award Financial
  | 'D1'   // Award & Awardee Attributes (Procurement)
  | 'D2'   // Award & Awardee Attributes (Financial Assistance)
  | 'E'    // Additional Awardee Attributes
  | 'F';   // Sub-Award Attributes

export interface DATAActFile {
  fileType: DATAActFileType;
  fileName: string;
  recordCount: number;
  content: ArrayBuffer | string;
}

export interface SubmissionParams {
  agencyCode: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  files: DATAActFile[];
  submittedBy: string;
}

export interface SubmissionResult {
  submissionId: string;
  status: 'received' | 'validating' | 'validated' | 'certified' | 'published' | 'failed';
  submittedAt: string;
  validationResults?: ValidationResult[];
  certificationStatus?: CertificationStatus;
  warnings: string[];
  errors: string[];
}

export interface ValidationResult {
  fileType: DATAActFileType;
  status: 'passed' | 'failed' | 'warning';
  totalRows: number;
  validRows: number;
  errorCount: number;
  warningCount: number;
  errors: ValidationError[];
}

export interface ValidationError {
  fileType: DATAActFileType;
  row: number;
  field: string;
  ruleId: string;
  severity: 'fatal' | 'warning';
  message: string;
}

export interface CertificationStatus {
  certifiedBy?: string;
  certifiedAt?: string;
  seniorAccountableOfficial?: string;
  comments?: string;
}

export interface SubmissionHistory {
  submissionId: string;
  agencyCode: string;
  fiscalYear: number;
  fiscalQuarter: number;
  status: SubmissionResult['status'];
  submittedAt: string;
  certifiedAt?: string;
  publishedAt?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DATAActSubmissionAdapter {
  /**
   * Submit DATA Act files to the broker.
   */
  submitFiles(params: SubmissionParams): Promise<SubmissionResult>;

  /**
   * Check the status of a submission.
   */
  checkSubmissionStatus(submissionId: string): Promise<SubmissionResult>;

  /**
   * Get certification status for a submission.
   */
  getCertificationStatus(submissionId: string): Promise<CertificationStatus>;

  /**
   * Certify a submission (after validation passes).
   */
  certifySubmission(params: {
    submissionId: string;
    certifiedBy: string;
    seniorAccountableOfficial: string;
    comments?: string;
  }): Promise<SubmissionResult>;

  /**
   * Get submission history for an agency.
   */
  getSubmissionHistory(params: {
    agencyCode: string;
    fiscalYear?: number;
  }): Promise<SubmissionHistory[]>;

  /**
   * Run cross-file validations (A↔B, C↔D1/D2) before submission.
   */
  validateCrossFile(files: DATAActFile[]): Promise<ValidationResult[]>;
}

// ---------------------------------------------------------------------------
// Mock Implementation
// ---------------------------------------------------------------------------

export class DATAActMockAdapter implements DATAActSubmissionAdapter {
  private submissions = new Map<string, SubmissionResult>();
  private history: SubmissionHistory[] = [];

  async submitFiles(params: SubmissionParams): Promise<SubmissionResult> {
    const submissionId = `DATA-${params.agencyCode}-FY${params.fiscalYear}Q${params.fiscalQuarter}-${Date.now()}`;

    const validationResults: ValidationResult[] = params.files.map(file => ({
      fileType: file.fileType,
      status: 'passed' as const,
      totalRows: file.recordCount,
      validRows: file.recordCount,
      errorCount: 0,
      warningCount: 0,
      errors: [],
    }));

    // Check for required file types
    const warnings: string[] = [];
    const requiredFiles: DATAActFileType[] = ['A', 'B', 'C'];
    for (const req of requiredFiles) {
      if (!params.files.some(f => f.fileType === req)) {
        warnings.push(`File ${req} is required but was not included in submission`);
      }
    }

    const result: SubmissionResult = {
      submissionId,
      status: warnings.length > 0 ? 'validated' : 'validated',
      submittedAt: new Date().toISOString(),
      validationResults,
      warnings,
      errors: [],
    };

    this.submissions.set(submissionId, result);
    this.history.push({
      submissionId,
      agencyCode: params.agencyCode,
      fiscalYear: params.fiscalYear,
      fiscalQuarter: params.fiscalQuarter,
      status: result.status,
      submittedAt: result.submittedAt,
    });

    return result;
  }

  async checkSubmissionStatus(submissionId: string): Promise<SubmissionResult> {
    const result = this.submissions.get(submissionId);
    if (!result) throw new Error(`Submission not found: ${submissionId}`);
    return result;
  }

  async getCertificationStatus(submissionId: string): Promise<CertificationStatus> {
    const result = this.submissions.get(submissionId);
    if (!result) throw new Error(`Submission not found: ${submissionId}`);
    return result.certificationStatus ?? {};
  }

  async certifySubmission(params: {
    submissionId: string;
    certifiedBy: string;
    seniorAccountableOfficial: string;
    comments?: string;
  }): Promise<SubmissionResult> {
    const result = this.submissions.get(params.submissionId);
    if (!result) throw new Error(`Submission not found: ${params.submissionId}`);

    if (result.status !== 'validated') {
      throw new Error(`Cannot certify submission in status: ${result.status}`);
    }

    result.status = 'certified';
    result.certificationStatus = {
      certifiedBy: params.certifiedBy,
      certifiedAt: new Date().toISOString(),
      seniorAccountableOfficial: params.seniorAccountableOfficial,
      comments: params.comments,
    };

    this.submissions.set(params.submissionId, result);
    return result;
  }

  async getSubmissionHistory(params: {
    agencyCode: string;
    fiscalYear?: number;
  }): Promise<SubmissionHistory[]> {
    return this.history.filter(h => {
      if (h.agencyCode !== params.agencyCode) return false;
      if (params.fiscalYear && h.fiscalYear !== params.fiscalYear) return false;
      return true;
    });
  }

  async validateCrossFile(files: DATAActFile[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Check File A ↔ File B consistency
    const fileA = files.find(f => f.fileType === 'A');
    const fileB = files.find(f => f.fileType === 'B');

    if (fileA && fileB) {
      results.push({
        fileType: 'A',
        status: 'passed',
        totalRows: fileA.recordCount,
        validRows: fileA.recordCount,
        errorCount: 0,
        warningCount: 0,
        errors: [],
      });
    }

    // Check File C ↔ File D1/D2 consistency
    const fileC = files.find(f => f.fileType === 'C');
    const fileD1 = files.find(f => f.fileType === 'D1');

    if (fileC && fileD1) {
      results.push({
        fileType: 'C',
        status: 'passed',
        totalRows: fileC.recordCount,
        validRows: fileC.recordCount,
        errorCount: 0,
        warningCount: 0,
        errors: [],
      });
    }

    return results;
  }
}
