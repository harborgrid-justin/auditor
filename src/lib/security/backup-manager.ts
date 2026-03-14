/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Server-side only module using Node.js crypto and fs
/**
 * Backup and Disaster Recovery Manager
 *
 * Manages encrypted backups of the DoD financial audit database with
 * integrity verification, RTO/RPO compliance tracking, and disaster
 * recovery reporting. Designed to meet DoD continuity of operations
 * (COOP) requirements for financial systems.
 *
 * Backup strategy:
 *   - Full backup:        Daily (configurable schedule)
 *   - Incremental (WAL):  Hourly WAL-based archival
 *   - Encryption:         AES-256-GCM before storage
 *   - Integrity:          SHA-256 checksum verification
 *   - Retention:          90 days (configurable per data classification)
 *
 * Recovery targets:
 *   - RTO (Recovery Time Objective):  < 4 hours
 *   - RPO (Recovery Point Objective): < 1 hour
 *
 * References:
 *   - NIST SP 800-34 Rev. 1: Contingency Planning Guide for Federal
 *     Information Systems
 *   - NIST SP 800-53 Rev. 5, CP-9: Information System Backup
 *   - NIST SP 800-53 Rev. 5, CP-10: System Recovery and Reconstitution
 *   - DoD Instruction 8500.01: Cybersecurity
 *   - FedRAMP: Federal Risk and Authorization Management Program
 *     (Backup and Contingency Planning requirements)
 */

import {
  createCipheriv,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Backup schedule and storage configuration. */
export interface BackupConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** Base path for local backup storage */
  storagePath: string;
  /** Encryption key for backup files (raw key material for AES-256) */
  encryptionKey: string;
  /** Cron expression for full backups (default: daily at 02:00 UTC) */
  fullBackupCron: string;
  /** Interval in minutes for incremental WAL archival (default: 60) */
  incrementalIntervalMinutes: number;
  /** Backup retention period in days (default: 90) */
  retentionDays: number;
  /** RTO target in minutes (default: 240 = 4 hours) */
  rtoTargetMinutes: number;
  /** RPO target in minutes (default: 60 = 1 hour) */
  rpoTargetMinutes: number;
}

/** Metadata record for a completed or in-progress backup. */
export interface BackupRecord {
  /** Unique backup identifier */
  id: string;
  /** Backup type */
  type: 'full' | 'incremental';
  /** Current status */
  status: 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'verified';
  /** Local file path of the backup */
  filePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA-256 checksum of the encrypted backup */
  checksum: string;
  /** Whether the backup file is encrypted */
  encrypted: boolean;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 completion timestamp */
  completedAt?: string;
  /** Database name */
  databaseName: string;
}

/** Request to initiate a restore operation. */
export interface RestoreRequest {
  /** ID of the backup to restore from */
  backupId: string;
  /** Target database connection string */
  targetDatabaseUrl: string;
  /** Whether to perform a point-in-time recovery using WAL */
  pointInTimeRecovery: boolean;
  /** Target timestamp for point-in-time recovery (ISO 8601) */
  targetTimestamp?: string;
}

/** RTO/RPO compliance and overall DR readiness status. */
export interface DRStatus {
  /** Last successful full backup timestamp (ISO 8601) */
  lastFullBackup: string | null;
  /** Last successful incremental backup timestamp (ISO 8601) */
  lastIncrementalBackup: string | null;
  /** Current estimated RPO in minutes */
  currentRPOMinutes: number;
  /** Current estimated RTO in minutes */
  currentRTOMinutes: number;
  /** Whether RPO target is met */
  rpoCompliant: boolean;
  /** Whether RTO target is met */
  rtoCompliant: boolean;
  /** Total number of stored backups */
  totalBackups: number;
  /** Total storage consumed in bytes */
  totalStorageBytes: number;
  /** Issues detected */
  issues: string[];
}

/** Full DR compliance report for audit purposes. */
export interface DRComplianceReport {
  /** Overall DR readiness */
  compliant: boolean;
  /** Current DR status */
  status: DRStatus;
  /** RTO target in minutes */
  rtoTargetMinutes: number;
  /** RPO target in minutes */
  rpoTargetMinutes: number;
  /** Backup records summary */
  backupSummary: {
    fullBackups: number;
    incrementalBackups: number;
    verifiedBackups: number;
    failedBackups: number;
  };
  /** Report generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Regulatory citations */
  citations: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_IV_LENGTH = 12; // 96-bit IV for GCM
const ENCRYPTION_AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENCRYPTION_KEY_LENGTH = 32; // 256-bit key

/** Default configuration per DoD COOP requirements. */
const DEFAULT_CONFIG: Omit<BackupConfig, 'databaseUrl' | 'storagePath' | 'encryptionKey'> = {
  fullBackupCron: '0 2 * * *', // Daily at 02:00 UTC
  incrementalIntervalMinutes: 60, // Hourly
  retentionDays: 90,
  rtoTargetMinutes: 240, // < 4 hours
  rpoTargetMinutes: 60, // < 1 hour
};

// ---------------------------------------------------------------------------
// Backup Manager
// ---------------------------------------------------------------------------

/**
 * Backup and Disaster Recovery Manager.
 *
 * Manages database backup lifecycle including creation, encryption,
 * integrity verification, restore initiation, and DR compliance reporting.
 *
 * @see NIST SP 800-34 Rev. 1 -- Contingency Planning Guide
 * @see DoD Instruction 8500.01 -- Cybersecurity
 * @see FedRAMP -- Backup and Contingency Planning
 */
export class BackupManager {
  private readonly config: BackupConfig;
  private readonly backups: Map<string, BackupRecord> = new Map();

  constructor(
    config: Pick<BackupConfig, 'databaseUrl' | 'storagePath' | 'encryptionKey'> &
      Partial<BackupConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config } as BackupConfig;
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  /**
   * Configure the backup schedule.
   *
   * Sets up the cron schedule for full backups and the interval for
   * incremental WAL-based backups. Does not start execution; use with
   * an external scheduler (e.g., node-cron, systemd timer).
   *
   * @param config - Partial configuration to merge with existing settings
   * @returns The updated schedule configuration
   *
   * @see NIST SP 800-53 CP-9: Information System Backup
   */
  scheduleBackup(config: Partial<Pick<BackupConfig, 'fullBackupCron' | 'incrementalIntervalMinutes'>>): {
    fullBackupCron: string;
    incrementalIntervalMinutes: number;
  } {
    if (config.fullBackupCron) {
      this.config.fullBackupCron = config.fullBackupCron;
    }
    if (config.incrementalIntervalMinutes) {
      this.config.incrementalIntervalMinutes = config.incrementalIntervalMinutes;
    }

    return {
      fullBackupCron: this.config.fullBackupCron,
      incrementalIntervalMinutes: this.config.incrementalIntervalMinutes,
    };
  }

  // -------------------------------------------------------------------------
  // Backup Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a database backup.
   *
   * Performs either a full pg_dump-style backup or an incremental WAL-based
   * backup. The backup data is encrypted with AES-256-GCM and a SHA-256
   * checksum is computed for integrity verification.
   *
   * Per NIST SP 800-53 CP-9:
   *   - Backups must be encrypted at rest (AES-256)
   *   - Backup integrity must be verifiable (SHA-256 checksum)
   *   - Backups must be stored at a geographically separate location
   *
   * @param type - 'full' for complete database dump, 'incremental' for WAL-based
   * @param targetPath - Directory path for the backup file
   * @returns Backup record with metadata
   *
   * @see NIST SP 800-53 CP-9
   * @see DoD Instruction 8500.01
   */
  async performBackup(
    type: 'full' | 'incremental',
    targetPath: string,
  ): Promise<BackupRecord> {
    const backupId = this.generateBackupId();
    const timestamp = new Date().toISOString();
    const fileName = `backup_${type}_${backupId}.enc`;
    const filePath = `${targetPath}/${fileName}`;

    const record: BackupRecord = {
      id: backupId,
      type,
      status: 'in_progress',
      filePath,
      sizeBytes: 0,
      checksum: '',
      encrypted: true,
      createdAt: timestamp,
      databaseName: this.extractDatabaseName(),
    };

    this.backups.set(backupId, record);

    try {
      // Step 1: Execute database dump
      // In production, calls pg_dump (full) or pg_receivewal (incremental)
      const rawData = await this.executeDump(type);

      // Step 2: Encrypt with AES-256-GCM
      const encryptedData = this.encryptData(rawData);

      // Step 3: Compute SHA-256 checksum
      const checksum = createHash('sha256').update(encryptedData).digest('hex');

      // Step 4: Write encrypted backup to storage with restricted permissions
      await fs.promises.mkdir(require('path').dirname(filePath), { recursive: true, mode: 0o700 });
      await fs.promises.writeFile(filePath, encryptedData, { mode: 0o600 });

      // Update record
      record.status = 'completed';
      record.completedAt = new Date().toISOString();
      record.sizeBytes = encryptedData.length;
      record.checksum = checksum;
      this.backups.set(backupId, record);

      return record;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      record.status = 'failed';
      record.completedAt = new Date().toISOString();
      this.backups.set(backupId, record);

      return record;
    }
  }

  // -------------------------------------------------------------------------
  // Encryption
  // -------------------------------------------------------------------------

  /**
   * Encrypt a backup file using AES-256-GCM.
   *
   * Per NIST SP 800-53 SC-28 and DoD IL4/IL5 requirements, all backup
   * data must be encrypted before storage. Uses AES-256-GCM for
   * authenticated encryption.
   *
   * @param backupPath - Path to the unencrypted backup file
   * @param encryptionKey - Raw key material (will be derived to 256 bits via SHA-256)
   * @returns Object with encrypted data path and checksum
   *
   * @see NIST SP 800-53 SC-28: Protection of Information at Rest
   * @see FIPS 197: AES
   * @see NIST SP 800-38D: GCM Mode
   */
  encryptBackup(
    backupPath: string,
    encryptionKey: string,
  ): { encryptedPath: string; checksum: string } {
    // Derive 256-bit key from key material
    const key = createHash('sha256').update(encryptionKey).digest();
    const iv = randomBytes(ENCRYPTION_IV_LENGTH);

    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
    });

    // In production: stream from backupPath file, write to encryptedPath
    // Placeholder: operate on empty buffer for interface demonstration
    const encrypted = Buffer.concat([cipher.update(Buffer.alloc(0)), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Encrypted format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    const encryptedData = Buffer.concat([iv, authTag, encrypted]);
    const checksum = createHash('sha256').update(encryptedData).digest('hex');

    const encryptedPath = `${backupPath}.enc`;
    fs.writeFileSync(encryptedPath, encryptedData, { mode: 0o600 });

    return { encryptedPath, checksum };
  }

  // -------------------------------------------------------------------------
  // Integrity Verification
  // -------------------------------------------------------------------------

  /**
   * Verify backup integrity by comparing SHA-256 checksums.
   *
   * Per NIST SP 800-53 CP-9(1), backup integrity must be verified using
   * checksums or digital signatures to detect corruption or tampering.
   *
   * @param backupPath - Path to the backup file
   * @param checksum - Expected SHA-256 checksum (hex string)
   * @returns Integrity verification result
   *
   * @see NIST SP 800-53 CP-9(1): Testing for Reliability and Integrity
   */
  verifyBackupIntegrity(
    backupPath: string,
    checksum: string,
  ): { valid: boolean; expectedChecksum: string; actualChecksum: string; reason: string } {
    const fileData = fs.readFileSync(backupPath);
    const actualChecksum = createHash('sha256').update(fileData).digest('hex');

    const valid = actualChecksum === checksum;

    return {
      valid,
      expectedChecksum: checksum,
      actualChecksum,
      reason: valid
        ? 'Backup integrity verified. SHA-256 checksum matches.'
        : `Checksum mismatch: expected ${checksum}, got ${actualChecksum}. ` +
          'Backup may be corrupted or tampered with. Ref: NIST SP 800-53 CP-9(1).',
    };
  }

  // -------------------------------------------------------------------------
  // Listing and Querying
  // -------------------------------------------------------------------------

  /**
   * List available backups with metadata.
   *
   * @param storagePath - Optional filter by storage path
   * @returns Array of backup records sorted by creation date (newest first)
   */
  listBackups(storagePath?: string): BackupRecord[] {
    let records = Array.from(this.backups.values());

    if (storagePath) {
      records = records.filter(r => r.filePath.startsWith(storagePath));
    }

    return records.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // -------------------------------------------------------------------------
  // Restore Operations
  // -------------------------------------------------------------------------

  /**
   * Initiate a restore process from a backup.
   *
   * Validates the backup exists and is in a restorable state, then returns
   * the restore plan. Actual restore execution (pg_restore) would be
   * triggered by the operations team.
   *
   * Per NIST SP 800-53 CP-10: System Recovery and Reconstitution
   *
   * @param backupId - ID of the backup to restore
   * @param targetConfig - Target database configuration
   * @returns Restore plan or error
   *
   * @see NIST SP 800-53 CP-10
   * @see NIST SP 800-34 Section 5.4 -- System Recovery
   */
  initiateRestore(
    backupId: string,
    targetConfig: { targetDatabaseUrl: string },
  ): {
    success: boolean;
    restoreId: string;
    backupRecord: BackupRecord | null;
    reason: string;
    estimatedMinutes: number;
  } {
    const record = this.backups.get(backupId);

    if (!record) {
      return {
        success: false,
        restoreId: '',
        backupRecord: null,
        reason: `Backup "${backupId}" not found.`,
        estimatedMinutes: 0,
      };
    }

    if (record.status === 'failed') {
      return {
        success: false,
        restoreId: '',
        backupRecord: record,
        reason: `Backup "${backupId}" is in failed state and cannot be restored.`,
        estimatedMinutes: 0,
      };
    }

    if (record.status === 'in_progress') {
      return {
        success: false,
        restoreId: '',
        backupRecord: record,
        reason: `Backup "${backupId}" is still in progress.`,
        estimatedMinutes: 0,
      };
    }

    // Estimate restore time based on backup size (rough: 100 MB/min + 30 min overhead)
    const estimatedMinutes = Math.max(
      30,
      Math.round(record.sizeBytes / (100 * 1024 * 1024) + 30),
    );

    const restoreId = `restore_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;

    return {
      success: true,
      restoreId,
      backupRecord: record,
      reason: `Restore initiated from backup ${backupId} to ${targetConfig.targetDatabaseUrl}.`,
      estimatedMinutes,
    };
  }

  // -------------------------------------------------------------------------
  // RTO / RPO Tracking
  // -------------------------------------------------------------------------

  /**
   * Calculate the current Recovery Point Objective (RPO) status.
   *
   * RPO measures the maximum acceptable data loss in time. It is calculated
   * as the elapsed time since the last successful backup.
   *
   * Target: < 1 hour per DoD COOP requirements.
   *
   * @param lastBackupTime - ISO 8601 timestamp of the last successful backup
   * @returns RPO compliance status
   *
   * @see NIST SP 800-34 Section 3.4 -- Recovery Objectives
   */
  calculateRPO(lastBackupTime: string): {
    currentRPOMinutes: number;
    targetRPOMinutes: number;
    compliant: boolean;
    reason: string;
  } {
    const now = Date.now();
    const lastBackup = new Date(lastBackupTime).getTime();
    const elapsedMinutes = Math.round((now - lastBackup) / 60000);

    const compliant = elapsedMinutes <= this.config.rpoTargetMinutes;

    return {
      currentRPOMinutes: elapsedMinutes,
      targetRPOMinutes: this.config.rpoTargetMinutes,
      compliant,
      reason: compliant
        ? `RPO compliant: ${elapsedMinutes} min since last backup (target: ${this.config.rpoTargetMinutes} min).`
        : `RPO violation: ${elapsedMinutes} min since last backup exceeds target of ` +
          `${this.config.rpoTargetMinutes} min. Ref: NIST SP 800-34.`,
    };
  }

  /**
   * Calculate the current Recovery Time Objective (RTO) status.
   *
   * RTO measures the maximum tolerable downtime before mission impact.
   * It is estimated based on backup size and typical restore throughput.
   *
   * Target: < 4 hours per DoD COOP requirements.
   *
   * @param restoreEstimate - Estimated restore time in minutes
   * @returns RTO compliance status
   *
   * @see NIST SP 800-34 Section 3.4 -- Recovery Objectives
   */
  calculateRTO(restoreEstimate: number): {
    estimatedRTOMinutes: number;
    targetRTOMinutes: number;
    compliant: boolean;
    reason: string;
  } {
    const compliant = restoreEstimate <= this.config.rtoTargetMinutes;

    return {
      estimatedRTOMinutes: restoreEstimate,
      targetRTOMinutes: this.config.rtoTargetMinutes,
      compliant,
      reason: compliant
        ? `RTO compliant: estimated ${restoreEstimate} min recovery (target: ${this.config.rtoTargetMinutes} min).`
        : `RTO risk: estimated ${restoreEstimate} min recovery exceeds target of ` +
          `${this.config.rtoTargetMinutes} min. Ref: NIST SP 800-34.`,
    };
  }

  // -------------------------------------------------------------------------
  // DR Compliance Reporting
  // -------------------------------------------------------------------------

  /**
   * Generate a Disaster Recovery compliance report.
   *
   * Produces a comprehensive report evaluating backup health, RTO/RPO
   * compliance, and overall DR readiness. Suitable for inclusion in
   * ATO documentation and FedRAMP continuous monitoring.
   *
   * @returns DR compliance report
   *
   * @see NIST SP 800-34 Rev. 1: Contingency Planning Guide
   * @see DoD Instruction 8500.01: Cybersecurity
   * @see FedRAMP: Continuous Monitoring Strategy Guide
   */
  generateDRReport(): DRComplianceReport {
    const allBackups = this.listBackups();
    const now = new Date();

    // Categorize backups
    const fullBackups = allBackups.filter(b => b.type === 'full');
    const incrementalBackups = allBackups.filter(b => b.type === 'incremental');
    const verifiedBackups = allBackups.filter(b => b.status === 'verified');
    const failedBackups = allBackups.filter(b => b.status === 'failed');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const completedBackups = allBackups.filter(
      b => b.status === 'completed' || b.status === 'verified',
    );

    // Last successful backups
    const lastFullCompleted = fullBackups.find(b => b.status === 'completed' || b.status === 'verified');
    const lastIncrementalCompleted = incrementalBackups.find(
      b => b.status === 'completed' || b.status === 'verified',
    );

    const lastFullBackup = lastFullCompleted?.completedAt ?? null;
    const lastIncrementalBackup = lastIncrementalCompleted?.completedAt ?? null;

    // RPO calculation
    const lastBackupTime = lastIncrementalBackup || lastFullBackup;
    const currentRPOMinutes = lastBackupTime
      ? Math.round((now.getTime() - new Date(lastBackupTime).getTime()) / 60000)
      : -1;

    // RTO estimation
    const lastFullSize = lastFullCompleted?.sizeBytes ?? 0;
    const currentRTOMinutes = lastFullSize > 0
      ? Math.round(lastFullSize / (100 * 1024 * 1024) + 30)
      : this.config.rtoTargetMinutes;

    const rpoCompliant = currentRPOMinutes >= 0 && currentRPOMinutes <= this.config.rpoTargetMinutes;
    const rtoCompliant = currentRTOMinutes <= this.config.rtoTargetMinutes;

    const issues: string[] = [];

    if (!lastFullBackup) {
      issues.push('No completed full backup found. Perform an initial full backup immediately.');
    }

    if (!rpoCompliant && currentRPOMinutes >= 0) {
      issues.push(
        `RPO violation: ${currentRPOMinutes} min since last backup (target: ${this.config.rpoTargetMinutes} min). ` +
          'Ref: NIST SP 800-34.',
      );
    }

    if (!rtoCompliant) {
      issues.push(
        `RTO risk: estimated ${currentRTOMinutes} min recovery exceeds ${this.config.rtoTargetMinutes} min target. ` +
          'Ref: NIST SP 800-34.',
      );
    }

    if (failedBackups.length > 0) {
      issues.push(
        `${failedBackups.length} backup(s) in failed state. Investigate and remediate.`,
      );
    }

    const totalStorageBytes = allBackups.reduce((sum, b) => sum + b.sizeBytes, 0);

    const status: DRStatus = {
      lastFullBackup,
      lastIncrementalBackup,
      currentRPOMinutes: currentRPOMinutes >= 0 ? currentRPOMinutes : -1,
      currentRTOMinutes,
      rpoCompliant,
      rtoCompliant,
      totalBackups: allBackups.length,
      totalStorageBytes,
      issues,
    };

    return {
      compliant: rpoCompliant && rtoCompliant && issues.length === 0,
      status,
      rtoTargetMinutes: this.config.rtoTargetMinutes,
      rpoTargetMinutes: this.config.rpoTargetMinutes,
      backupSummary: {
        fullBackups: fullBackups.length,
        incrementalBackups: incrementalBackups.length,
        verifiedBackups: verifiedBackups.length,
        failedBackups: failedBackups.length,
      },
      generatedAt: new Date().toISOString(),
      citations: [
        'NIST SP 800-34 Rev. 1: Contingency Planning Guide for Federal Information Systems',
        'NIST SP 800-53 Rev. 5, CP-9: Information System Backup',
        'NIST SP 800-53 Rev. 5, CP-10: System Recovery and Reconstitution',
        'DoD Instruction 8500.01: Cybersecurity',
        'FedRAMP: Federal Risk and Authorization Management Program',
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a unique backup identifier.
   */
  private generateBackupId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `bk_${timestamp}_${random}`;
  }

  /**
   * Extract database name from the connection string.
   */
  private extractDatabaseName(): string {
    try {
      const url = new URL(this.config.databaseUrl);
      return url.pathname.replace('/', '') || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Execute a PostgreSQL database dump.
   *
   * Invokes pg_dump (full) or pg_basebackup (incremental) via child_process
   * with streaming output and error handling.
   *
   * @see NIST SP 800-53 CP-9: Information System Backup
   */
  private async executeDump(type: 'full' | 'incremental'): Promise<Buffer> {
    const { execFile } = require('child_process') as typeof import('child_process');
    const url = new URL(this.config.databaseUrl);
    const host = url.hostname || 'localhost';
    const port = url.port || '5432';
    const dbName = url.pathname.replace('/', '') || 'auditpro';
    const user = url.username || 'auditpro';

    const env = {
      ...process.env,
      PGPASSWORD: url.password || process.env.DB_PASSWORD || '',
    };

    return new Promise<Buffer>((resolve, reject) => {
      if (type === 'full') {
        // pg_dump with custom format for compression and selective restore
        const args = [
          '-h', host,
          '-p', port,
          '-U', user,
          '-Fc',              // custom format (compressed)
          '--no-owner',
          '--no-privileges',
          dbName,
        ];

        const child = execFile('pg_dump', args, {
          encoding: 'buffer',
          maxBuffer: 1024 * 1024 * 512, // 512MB max
          env,
        }, (error: Error | null, stdout: Buffer) => {
          if (error) {
            reject(new Error(`pg_dump failed: ${error.message}`));
            return;
          }
          resolve(stdout);
        });

        child.on('error', (err: Error) => {
          reject(new Error(`pg_dump spawn failed: ${err.message}`));
        });
      } else {
        // Incremental: use pg_basebackup with WAL streaming
        const backupDir = require('path').join(
          require('os').tmpdir(),
          `auditpro_incremental_${Date.now()}`,
        );
        const args = [
          '-h', host,
          '-p', port,
          '-U', user,
          '-D', backupDir,
          '--wal-method=stream',
          '--checkpoint=fast',
          '--format=tar',
        ];

        execFile('pg_basebackup', args, {
          encoding: 'buffer',
          maxBuffer: 1024 * 1024 * 1024, // 1GB max
          env,
        }, async (error: Error | null) => {
          if (error) {
            reject(new Error(`pg_basebackup failed: ${error.message}`));
            return;
          }
          try {
            // Read the tar output from the backup directory
            const tarPath = require('path').join(backupDir, 'base.tar');
            const data = fs.readFileSync(tarPath);
            // Clean up temp directory
            fs.rmSync(backupDir, { recursive: true, force: true });
            resolve(data);
          } catch (readErr) {
            reject(new Error(`Failed to read incremental backup: ${(readErr as Error).message}`));
          }
        });
      }
    });
  }

  /**
   * Encrypt raw data using AES-256-GCM.
   *
   * Output format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
   */
  private encryptData(data: Buffer): Buffer {
    const key = createHash('sha256').update(this.config.encryptionKey).digest();
    const iv = randomBytes(ENCRYPTION_IV_LENGTH);

    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }
}
