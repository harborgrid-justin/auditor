/**
 * Backup and Disaster Recovery Manager
 *
 * Manages encrypted backups of the DoD financial audit database with
 * automated scheduling, integrity verification, and off-site replication.
 * Designed to meet DoD IL4/IL5 continuity of operations (COOP) requirements.
 *
 * Backup strategy:
 *   - Full backup:        Daily at 02:00 UTC (configurable)
 *   - Incremental (WAL):  Continuous / hourly archival
 *   - Retention:          90 days (configurable per data classification)
 *   - Encryption:         AES-256-GCM before storage
 *   - Off-site storage:   S3-compatible or Azure Blob (IL4/IL5 regions)
 *
 * Recovery targets:
 *   - RTO (Recovery Time Objective):  < 4 hours
 *   - RPO (Recovery Point Objective): < 1 hour
 *
 * References:
 *   - NIST SP 800-34 Rev. 1: Contingency Planning Guide
 *   - NIST SP 800-53 Rev. 5, CP-9: Information System Backup
 *   - NIST SP 800-53 Rev. 5, CP-10: System Recovery and Reconstitution
 *   - DoDI 8500.01: Cybersecurity
 *   - DoD IL4/IL5: Impact Level Requirements for Cloud Systems
 *   - DoD CC SRG: Cloud Computing Security Requirements Guide
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Backup configuration. */
export interface BackupConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** Base path for local backup storage */
  backupBasePath: string;
  /** Encryption key for backup files (AES-256) */
  encryptionKey: string;
  /** Full backup schedule (cron expression) */
  fullBackupSchedule: string;
  /** WAL archival interval in minutes */
  walArchiveIntervalMinutes: number;
  /** Backup retention period in days */
  retentionDays: number;
  /** Off-site storage configuration */
  offSiteStorage?: OffSiteStorageConfig;
  /** RTO target in minutes */
  rtoTargetMinutes: number;
  /** RPO target in minutes */
  rpoTargetMinutes: number;
}

/** Off-site storage provider configuration. */
export interface OffSiteStorageConfig {
  provider: 'S3' | 'AZURE_BLOB' | 'GCS';
  /** Bucket or container name */
  bucket: string;
  /** Region (must be IL4/IL5 authorized for DoD workloads) */
  region: string;
  /** Storage endpoint URL (for GovCloud or IL5 endpoints) */
  endpoint?: string;
  /** Access credentials (use IAM roles in production) */
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Metadata for a completed backup. */
export interface BackupMetadata {
  id: string;
  type: 'full' | 'incremental_wal';
  status: 'in_progress' | 'completed' | 'failed' | 'verified';
  /** ISO 8601 timestamp */
  createdAt: string;
  completedAt?: string;
  /** Backup file size in bytes */
  sizeBytes: number;
  /** SHA-256 checksum of the encrypted backup file */
  checksum: string;
  /** Whether the backup was encrypted */
  encrypted: boolean;
  /** Whether the backup was replicated to off-site storage */
  offSiteReplicated: boolean;
  /** Local file path */
  filePath: string;
  /** Off-site storage URI */
  offSiteUri?: string;
  /** Database name */
  databaseName: string;
  /** Number of tables backed up */
  tableCount?: number;
}

/** Backup integrity verification result. */
export interface BackupIntegrityResult {
  backupId: string;
  integrityValid: boolean;
  checksumMatch: boolean;
  expectedChecksum: string;
  actualChecksum: string;
  verifiedAt: string;
  issues: string[];
}

/** RTO/RPO compliance status. */
export interface BackupStatusReport {
  lastFullBackup: string | null;
  lastIncrementalBackup: string | null;
  rtoTargetMinutes: number;
  rpoTargetMinutes: number;
  estimatedRtoMinutes: number;
  estimatedRpoMinutes: number;
  rtoCompliant: boolean;
  rpoCompliant: boolean;
  totalBackups: number;
  totalSizeBytes: number;
  offSiteReplicationHealthy: boolean;
  issues: string[];
}

/** Schedule descriptor for automated backups. */
export interface BackupSchedule {
  type: 'full' | 'incremental_wal';
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_IV_LENGTH = 12;
const ENCRYPTION_AUTH_TAG_LENGTH = 16;

/** Default backup configuration per DoD COOP requirements. */
const DEFAULT_CONFIG: Partial<BackupConfig> = {
  fullBackupSchedule: '0 2 * * *',       // Daily at 02:00 UTC
  walArchiveIntervalMinutes: 60,          // Hourly WAL archival
  retentionDays: 90,                      // 90-day retention
  rtoTargetMinutes: 240,                  // < 4 hours RTO
  rpoTargetMinutes: 60,                   // < 1 hour RPO
};

// ---------------------------------------------------------------------------
// Backup Manager
// ---------------------------------------------------------------------------

/**
 * Backup and Disaster Recovery Manager.
 *
 * Manages the lifecycle of database backups including creation, encryption,
 * integrity verification, off-site replication, and retention enforcement.
 *
 * Usage:
 *   const manager = new BackupManager(config);
 *   const backup = await manager.createBackup();
 *   const integrity = await manager.verifyBackupIntegrity(backup.id);
 */
export class BackupManager extends EventEmitter {
  private readonly config: BackupConfig;
  private readonly backups: Map<string, BackupMetadata> = new Map();
  private schedules: BackupSchedule[] = [];

  constructor(config: Partial<BackupConfig> & Pick<BackupConfig, 'databaseUrl' | 'backupBasePath' | 'encryptionKey'>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as BackupConfig;
    this.initializeSchedules();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create an encrypted database backup.
   *
   * Performs a full PostgreSQL backup using pg_dump, encrypts the output
   * with AES-256-GCM, computes a SHA-256 checksum, and optionally
   * replicates to off-site storage.
   *
   * Per NIST SP 800-53 CP-9:
   *   - Backups must be encrypted at rest (AES-256)
   *   - Backups must be stored at a separate location
   *   - Backup integrity must be verifiable
   *
   * @param type - Backup type ('full' or 'incremental_wal')
   * @returns Backup metadata
   */
  async createBackup(type: 'full' | 'incremental_wal' = 'full'): Promise<BackupMetadata> {
    const backupId = this.generateBackupId();
    const timestamp = new Date().toISOString();
    const fileName = `backup_${type}_${backupId}.enc`;
    const filePath = `${this.config.backupBasePath}/${fileName}`;

    const metadata: BackupMetadata = {
      id: backupId,
      type,
      status: 'in_progress',
      createdAt: timestamp,
      sizeBytes: 0,
      checksum: '',
      encrypted: true,
      offSiteReplicated: false,
      filePath,
      databaseName: this.extractDatabaseName(),
    };

    this.backups.set(backupId, metadata);
    this.emit('backup:started', metadata);

    try {
      // Step 1: Execute database dump
      // In production, this calls pg_dump or pg_basebackup
      const rawData = await this.executeDatabaseDump(type);

      // Step 2: Encrypt the backup data with AES-256-GCM
      const encryptedData = this.encryptBackupData(rawData);

      // Step 3: Compute SHA-256 checksum of the encrypted output
      const checksum = createHash('sha256').update(encryptedData).digest('hex');

      // Step 4: Write to local storage
      // In production: fs.writeFileSync(filePath, encryptedData)
      await this.writeBackupFile(filePath, encryptedData);

      // Step 5: Replicate to off-site storage
      let offSiteReplicated = false;
      let offSiteUri: string | undefined;
      if (this.config.offSiteStorage) {
        const replicationResult = await this.replicateToOffSite(filePath, fileName);
        offSiteReplicated = replicationResult.success;
        offSiteUri = replicationResult.uri;
      }

      // Update metadata
      metadata.status = 'completed';
      metadata.completedAt = new Date().toISOString();
      metadata.sizeBytes = encryptedData.length;
      metadata.checksum = checksum;
      metadata.offSiteReplicated = offSiteReplicated;
      metadata.offSiteUri = offSiteUri;
      this.backups.set(backupId, metadata);

      this.emit('backup:completed', metadata);

      // Step 6: Enforce retention policy
      await this.enforceRetentionPolicy();

      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.completedAt = new Date().toISOString();
      this.backups.set(backupId, metadata);
      this.emit('backup:failed', { ...metadata, error });
      throw error;
    }
  }

  /**
   * Verify the integrity of a backup by recomputing its checksum.
   *
   * Per NIST SP 800-53 CP-9(1): Organizations must verify backup
   * information integrity using checksums or digital signatures.
   *
   * @param backupId - The backup identifier
   * @returns Integrity verification result
   */
  async verifyBackupIntegrity(backupId: string): Promise<BackupIntegrityResult> {
    const metadata = this.backups.get(backupId);
    if (!metadata) {
      return {
        backupId,
        integrityValid: false,
        checksumMatch: false,
        expectedChecksum: '',
        actualChecksum: '',
        verifiedAt: new Date().toISOString(),
        issues: [`Backup "${backupId}" not found.`],
      };
    }

    const issues: string[] = [];

    // Read the backup file and recompute checksum
    const fileData = await this.readBackupFile(metadata.filePath);
    const actualChecksum = createHash('sha256').update(fileData).digest('hex');
    const checksumMatch = actualChecksum === metadata.checksum;

    if (!checksumMatch) {
      issues.push(
        `Checksum mismatch: expected ${metadata.checksum}, got ${actualChecksum}. ` +
        'Backup may be corrupted or tampered with.',
      );
    }

    // Verify the encrypted data can be decrypted
    try {
      this.decryptBackupData(fileData);
    } catch {
      issues.push('Backup decryption failed. Encryption key may have changed.');
    }

    const result: BackupIntegrityResult = {
      backupId,
      integrityValid: checksumMatch && issues.length === 0,
      checksumMatch,
      expectedChecksum: metadata.checksum,
      actualChecksum,
      verifiedAt: new Date().toISOString(),
      issues,
    };

    if (result.integrityValid) {
      metadata.status = 'verified';
      this.backups.set(backupId, metadata);
    }

    this.emit('backup:verified', result);
    return result;
  }

  /**
   * List all backups with metadata.
   *
   * @param type - Optional filter by backup type
   * @returns Array of backup metadata sorted by creation date (newest first)
   */
  listBackups(type?: 'full' | 'incremental_wal'): BackupMetadata[] {
    let backups = Array.from(this.backups.values());

    if (type) {
      backups = backups.filter(b => b.type === type);
    }

    return backups.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get RTO/RPO compliance status.
   *
   * Evaluates the current backup state against the configured recovery
   * targets. Reports compliance issues if backups are stale or off-site
   * replication has failed.
   *
   * Per NIST SP 800-34 Rev. 1:
   *   - RTO: Maximum tolerable downtime before mission impact
   *   - RPO: Maximum tolerable data loss measured in time
   *
   * @returns Backup status report with compliance assessment
   */
  getBackupStatus(): BackupStatusReport {
    const now = new Date();
    const issues: string[] = [];
    const allBackups = this.listBackups();

    const fullBackups = allBackups.filter(b => b.type === 'full' && b.status !== 'failed');
    const walBackups = allBackups.filter(b => b.type === 'incremental_wal' && b.status !== 'failed');

    const lastFullBackup = fullBackups[0]?.completedAt ?? null;
    const lastIncrementalBackup = walBackups[0]?.completedAt ?? null;

    // Calculate estimated RPO from the most recent successful backup
    const lastBackupTime = lastIncrementalBackup || lastFullBackup;
    const estimatedRpoMinutes = lastBackupTime
      ? Math.round((now.getTime() - new Date(lastBackupTime).getTime()) / 60000)
      : Infinity;

    // Estimated RTO based on last full backup size and typical restore rate
    const lastFullSize = fullBackups[0]?.sizeBytes ?? 0;
    // Rough estimate: 100 MB/min restore speed + 30 min overhead
    const estimatedRtoMinutes = lastFullSize > 0
      ? Math.round(lastFullSize / (100 * 1024 * 1024) + 30)
      : this.config.rtoTargetMinutes;

    const rpoCompliant = estimatedRpoMinutes <= this.config.rpoTargetMinutes;
    const rtoCompliant = estimatedRtoMinutes <= this.config.rtoTargetMinutes;

    if (!rpoCompliant) {
      issues.push(
        `RPO violation: Last backup was ${estimatedRpoMinutes} minutes ago ` +
        `(target: ${this.config.rpoTargetMinutes} min). Ref: NIST SP 800-34.`,
      );
    }

    if (!rtoCompliant) {
      issues.push(
        `RTO risk: Estimated recovery time ${estimatedRtoMinutes} minutes ` +
        `exceeds target of ${this.config.rtoTargetMinutes} min. Ref: NIST SP 800-34.`,
      );
    }

    // Check off-site replication health
    const recentBackups = allBackups.slice(0, 5);
    const offSiteHealthy = this.config.offSiteStorage
      ? recentBackups.every(b => b.offSiteReplicated || b.status === 'in_progress')
      : true; // No off-site configured is not a failure per se

    if (this.config.offSiteStorage && !offSiteHealthy) {
      issues.push(
        'Off-site replication has failed for recent backups. ' +
        'Ref: NIST SP 800-53 CP-9.',
      );
    }

    if (!lastFullBackup) {
      issues.push('No full backups found. Perform an initial full backup immediately.');
    }

    const totalSizeBytes = allBackups.reduce((sum, b) => sum + b.sizeBytes, 0);

    return {
      lastFullBackup,
      lastIncrementalBackup,
      rtoTargetMinutes: this.config.rtoTargetMinutes,
      rpoTargetMinutes: this.config.rpoTargetMinutes,
      estimatedRtoMinutes,
      estimatedRpoMinutes: estimatedRpoMinutes === Infinity ? -1 : estimatedRpoMinutes,
      rtoCompliant,
      rpoCompliant,
      totalBackups: allBackups.length,
      totalSizeBytes,
      offSiteReplicationHealthy: offSiteHealthy,
      issues,
    };
  }

  /**
   * Get the configured backup schedules.
   */
  getSchedules(): BackupSchedule[] {
    return [...this.schedules];
  }

  // -------------------------------------------------------------------------
  // Encryption
  // -------------------------------------------------------------------------

  /**
   * Encrypt backup data using AES-256-GCM.
   *
   * Per NIST SP 800-53 SC-28 and DoD IL4/IL5 requirements, all backup
   * data must be encrypted before storage with AES-256.
   */
  private encryptBackupData(data: Buffer): Buffer {
    const key = createHash('sha256').update(this.config.encryptionKey).digest();
    const iv = randomBytes(ENCRYPTION_IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt backup data.
   */
  private decryptBackupData(encryptedData: Buffer): Buffer {
    const key = createHash('sha256').update(this.config.encryptionKey).digest();
    const iv = encryptedData.subarray(0, ENCRYPTION_IV_LENGTH);
    const authTag = encryptedData.subarray(
      ENCRYPTION_IV_LENGTH,
      ENCRYPTION_IV_LENGTH + ENCRYPTION_AUTH_TAG_LENGTH,
    );
    const ciphertext = encryptedData.subarray(
      ENCRYPTION_IV_LENGTH + ENCRYPTION_AUTH_TAG_LENGTH,
    );

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Initialize backup schedules from configuration.
   */
  private initializeSchedules(): void {
    this.schedules = [
      {
        type: 'full',
        cronExpression: this.config.fullBackupSchedule,
        enabled: true,
      },
      {
        type: 'incremental_wal',
        cronExpression: `*/${this.config.walArchiveIntervalMinutes} * * * *`,
        enabled: true,
      },
    ];
  }

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
   * In production, this invokes pg_dump (full) or pg_receivewal (WAL).
   * Returns the raw backup data as a Buffer.
   *
   * TODO: Implement actual pg_dump / pg_basebackup invocation via
   *       child_process.execFile with proper error handling and streaming.
   */
  private async executeDatabaseDump(type: 'full' | 'incremental_wal'): Promise<Buffer> {
    // TODO: Production implementation
    // Full backup:
    //   execFile('pg_dump', [
    //     '--format=custom',
    //     '--compress=6',
    //     '--dbname', this.config.databaseUrl,
    //   ])
    //
    // WAL archival:
    //   execFile('pg_receivewal', [
    //     '--directory', walPath,
    //     '--dbname', this.config.databaseUrl,
    //   ])

    // Placeholder: return an empty buffer for interface testing
    const placeholder = Buffer.from(
      JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        database: this.extractDatabaseName(),
        placeholder: true,
      }),
    );
    return placeholder;
  }

  /**
   * Write backup file to local storage.
   *
   * TODO: Implement actual file system write with proper permissions
   *       (0600) and directory validation.
   */
  private async writeBackupFile(filePath: string, data: Buffer): Promise<void> {
    // TODO: Production implementation
    // await fs.promises.writeFile(filePath, data, { mode: 0o600 });
    void filePath;
    void data;
  }

  /**
   * Read backup file from local storage.
   *
   * TODO: Implement actual file system read.
   */
  private async readBackupFile(filePath: string): Promise<Buffer> {
    // TODO: Production implementation
    // return fs.promises.readFile(filePath);
    void filePath;
    return Buffer.alloc(0);
  }

  /**
   * Replicate a backup file to off-site storage.
   *
   * Supports S3-compatible (AWS GovCloud, AWS IL5) and Azure Blob
   * (Azure Government IL4/IL5) storage providers.
   *
   * Per NIST SP 800-53 CP-9: Backup copies must be stored at a
   * geographically separate location.
   *
   * TODO: Implement S3/Azure Blob upload with proper IAM authentication.
   */
  private async replicateToOffSite(
    localPath: string,
    fileName: string,
  ): Promise<{ success: boolean; uri?: string }> {
    if (!this.config.offSiteStorage) {
      return { success: false };
    }

    const storage = this.config.offSiteStorage;

    // TODO: Production implementation
    // S3: new S3Client({ region: storage.region, endpoint: storage.endpoint })
    //     .send(new PutObjectCommand({ Bucket: storage.bucket, Key: fileName, Body: data }))
    //
    // Azure Blob: new BlobServiceClient(storage.endpoint)
    //     .getContainerClient(storage.bucket)
    //     .getBlockBlobClient(fileName)
    //     .upload(data, data.length)

    const uri = storage.provider === 'S3'
      ? `s3://${storage.bucket}/${fileName}`
      : storage.provider === 'AZURE_BLOB'
        ? `https://${storage.endpoint}/${storage.bucket}/${fileName}`
        : `gs://${storage.bucket}/${fileName}`;

    void localPath;
    return { success: true, uri };
  }

  /**
   * Enforce backup retention policy by removing expired backups.
   *
   * Per NIST SP 800-53 CP-9 and DoD records management requirements,
   * backups are retained for the configured period and then securely
   * deleted.
   */
  private async enforceRetentionPolicy(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const expiredBackups: string[] = [];

    for (const [id, metadata] of this.backups.entries()) {
      if (new Date(metadata.createdAt) < cutoffDate) {
        expiredBackups.push(id);
      }
    }

    for (const id of expiredBackups) {
      const metadata = this.backups.get(id);
      this.backups.delete(id);
      this.emit('backup:expired', metadata);

      // TODO: Delete physical backup file and off-site copy
      // await fs.promises.unlink(metadata.filePath);
    }

    if (expiredBackups.length > 0) {
      this.emit('retention:enforced', {
        removed: expiredBackups.length,
        retentionDays: this.config.retentionDays,
      });
    }
  }
}
