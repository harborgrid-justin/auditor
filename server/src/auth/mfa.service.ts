/**
 * Multi-Factor Authentication (MFA) Service
 *
 * Provides TOTP-based multi-factor authentication with backup recovery codes
 * for the DoD financial audit platform. Implements RFC 6238 Time-Based
 * One-Time Password generation using the Node.js crypto module for
 * HMAC-based OTP computation (simplified TOTP without external libraries).
 *
 * Capabilities:
 *   - TOTP (Time-Based One-Time Password) per RFC 6238
 *   - QR code provisioning URI for authenticator apps
 *   - 10 single-use backup recovery codes for account recovery
 *   - Role-based MFA enforcement policies
 *   - CAC/PIV bypass (PKI counts as MFA per NIST SP 800-63B)
 *
 * MFA enforcement policy:
 *   - admin:              MFA required
 *   - certifying_officer: MFA required
 *   - disbursing_officer: MFA required
 *   - auditor:            MFA recommended
 *   - viewer:             MFA optional
 *   - CAC/PIV users:      MFA satisfied (PKI is multi-factor per NIST)
 *
 * References:
 *   - RFC 6238: TOTP — Time-Based One-Time Password Algorithm
 *   - RFC 4226: HOTP — HMAC-Based One-Time Password Algorithm
 *   - NIST SP 800-63B: Digital Identity Guidelines — Authentication and
 *     Lifecycle Management (Section 4.2, AAL2/AAL3 requirements)
 *   - DoD Instruction 8520.02: Public Key Infrastructure (PKI) and
 *     Public Key (PK) Enabling
 *   - CNSSI 1253: Security Categorization and Control Selection
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** TOTP secret and provisioning data returned during enrollment. */
export interface MFASecret {
  /** Base32-encoded TOTP secret */
  secret: string;
  /** otpauth:// URI for QR code generation */
  provisioningUri: string;
  /** HMAC algorithm used (sha1 for broad authenticator compatibility) */
  algorithm: string;
  /** Number of digits in each OTP code */
  digits: number;
  /** Time step period in seconds */
  period: number;
}

/** MFA enrollment record for a user. */
export interface MFAEnrollment {
  userId: string;
  /** Base32-encoded TOTP secret */
  secret: string;
  /** Whether the enrollment has been confirmed via initial TOTP verification */
  confirmed: boolean;
  /** Hashed backup recovery codes (SHA-256) */
  backupCodesHashed: string[];
  /** Count of remaining unused backup codes */
  backupCodesRemaining: number;
  /** ISO 8601 timestamp of enrollment */
  enrolledAt: string;
  /** ISO 8601 timestamp of revocation, if revoked */
  revokedAt?: string;
}

/** Single-use backup recovery code. */
export interface BackupCode {
  /** The plaintext code (only shown once during generation) */
  code: string;
  /** SHA-256 hash for storage */
  hash: string;
  /** Whether this code has been consumed */
  consumed: boolean;
}

/** Result of an MFA verification attempt. */
export interface MFAVerification {
  /** Whether the token or code was valid */
  valid: boolean;
  /** Human-readable reason on failure */
  reason?: string;
  /** Whether a backup recovery code was used instead of TOTP */
  usedBackupCode?: boolean;
  /** Remaining backup codes after consumption (if applicable) */
  backupCodesRemaining?: number;
}

/** MFA enforcement policy for a specific role. */
export interface MFAPolicy {
  /** Role identifier */
  role: string;
  /** Whether MFA is required for this role */
  required: boolean;
  /** Policy explanation with regulatory citation */
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * TOTP configuration per RFC 6238.
 *
 * SHA-1 is used as the HMAC algorithm for maximum compatibility with
 * authenticator apps (Google Authenticator, Authy, Microsoft Authenticator).
 * While SHA-256/SHA-512 are supported by RFC 6238, many apps default to
 * SHA-1 and ignore the algorithm parameter.
 */
const TOTP_CONFIG = {
  /** Number of digits in the OTP code */
  digits: 6,
  /** Time step in seconds (standard 30-second window) */
  period: 30,
  /** HMAC algorithm — SHA-1 per RFC 6238 for authenticator compatibility */
  algorithm: 'sha1' as const,
  /**
   * Number of time steps to check before/after current step.
   * Tolerates +/- 30 seconds of clock skew per RFC 6238 Section 5.2.
   */
  window: 1,
} as const;

/** Number of backup recovery codes to generate per enrollment */
const BACKUP_CODE_COUNT = 10;

/** Character length of each backup recovery code */
const BACKUP_CODE_LENGTH = 10;

/** Issuer label for the TOTP provisioning URI */
const TOTP_ISSUER = 'DoD-Auditor';

/** Base32 alphabet per RFC 4648 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Character set for recovery codes.
 * Ambiguous characters (I/1, O/0) are removed to reduce transcription errors.
 */
const RECOVERY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Authentication methods exempt from MFA (PKI-based). */
const MFA_EXEMPT_AUTH_METHODS = ['cac_piv', 'piv', 'cac'] as const;

// ---------------------------------------------------------------------------
// MFA Enforcement Policies
// ---------------------------------------------------------------------------

/**
 * Role-based MFA enforcement policies.
 *
 * Per NIST SP 800-63B Section 4.2, AAL2 requires multi-factor authentication
 * for access to sensitive data. DoD financial data is categorized as CUI,
 * requiring AAL2 or higher for privileged roles.
 */
const MFA_POLICIES: MFAPolicy[] = [
  {
    role: 'admin',
    required: true,
    reason:
      'System administrators must use MFA per NIST SP 800-53 IA-2(1) and ' +
      'DoD Instruction 8520.02.',
  },
  {
    role: 'certifying_officer',
    required: true,
    reason:
      'Certifying officers handle financial certification and must use MFA ' +
      'per DoD FMR Vol. 5 and NIST SP 800-63B AAL2.',
  },
  {
    role: 'disbursing_officer',
    required: true,
    reason:
      'Disbursing officers handle fund disbursement and must use MFA ' +
      'per DoD FMR Vol. 5 and NIST SP 800-63B AAL2.',
  },
  {
    role: 'auditor',
    required: false,
    reason: 'MFA recommended for auditors accessing CUI data.',
  },
  {
    role: 'viewer',
    required: false,
    reason: 'MFA optional for read-only access.',
  },
];

const policyMap = new Map(MFA_POLICIES.map(p => [p.role, p]));

// ---------------------------------------------------------------------------
// In-memory enrollment store (replace with database in production)
// ---------------------------------------------------------------------------

/**
 * In-memory MFA enrollment store.
 *
 * In production, MFA secrets and recovery code hashes are stored in the
 * database with field-level encryption (see encryption.ts). This in-memory
 * store is for development and testing only.
 */
const enrollmentStore = new Map<
  string,
  {
    secret: string;
    confirmed: boolean;
    backupCodesHashed: string[];
    enrolledAt: string;
    revokedAt?: string;
  }
>();

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

@Injectable()
export class MFAService {
  private readonly logger = new Logger(MFAService.name);

  // -------------------------------------------------------------------------
  // TOTP Secret Generation
  // -------------------------------------------------------------------------

  /**
   * Generate a TOTP secret with a provisioning URI for QR code display.
   *
   * Creates a cryptographically random 160-bit secret (per RFC 4226
   * recommendation) and encodes it in Base32 for use with standard
   * authenticator apps. The provisioning URI follows the otpauth:// format.
   *
   * @param userId - The user's unique identifier (used as the account label)
   * @returns MFA secret with provisioning URI
   *
   * @see RFC 6238 Section 4 — TOTP Algorithm
   * @see RFC 4226 Section 4 — Key (Secret) Requirements
   */
  generateTOTPSecret(userId: string): MFASecret {
    // Generate 160-bit (20-byte) random secret per RFC 4226 recommendation
    const secretBytes = randomBytes(20);
    const secret = this.encodeBase32(secretBytes);

    // Build otpauth:// provisioning URI for QR code
    const provisioningUri = this.buildProvisioningUri(secret, userId);

    this.logger.log(`TOTP secret generated for user ${userId}`);

    return {
      secret,
      provisioningUri,
      algorithm: TOTP_CONFIG.algorithm.toUpperCase(),
      digits: TOTP_CONFIG.digits,
      period: TOTP_CONFIG.period,
    };
  }

  // -------------------------------------------------------------------------
  // TOTP Token Verification
  // -------------------------------------------------------------------------

  /**
   * Verify a 6-digit TOTP token against the user's enrolled secret.
   *
   * Checks the token against the current time step and adjacent steps
   * (configurable window) to accommodate clock skew between the server
   * and the user's authenticator app, per RFC 6238 Section 5.2.
   *
   * Uses constant-time comparison to prevent timing attacks, per
   * NIST SP 800-63B Section 5.1.4.2.
   *
   * @param userId - The user's unique identifier
   * @param token - The 6-digit TOTP token from the authenticator app
   * @returns Verification result
   *
   * @see RFC 6238 Section 5.2 — Validation and Time-Step Size
   * @see NIST SP 800-63B Section 5.1.4.2 — Verifier Requirements
   */
  verifyTOTPToken(userId: string, token: string): MFAVerification {
    const enrollment = enrollmentStore.get(userId);
    if (!enrollment) {
      return { valid: false, reason: 'MFA is not enrolled for this user.' };
    }

    if (enrollment.revokedAt) {
      return { valid: false, reason: 'MFA enrollment has been revoked.' };
    }

    // Validate token format
    if (!token || !/^\d{6}$/.test(token)) {
      return {
        valid: false,
        reason: 'Invalid token format. Expected a 6-digit numeric code.',
      };
    }

    // Check current time step and adjacent steps for clock skew tolerance
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / TOTP_CONFIG.period);

    let tokenValid = false;
    for (let offset = -TOTP_CONFIG.window; offset <= TOTP_CONFIG.window; offset++) {
      const expected = this.computeTOTP(enrollment.secret, timeStep + offset);
      if (this.constantTimeEqual(token, expected)) {
        tokenValid = true;
        break;
      }
    }

    if (!tokenValid) {
      this.logger.warn(`Failed TOTP verification for user ${userId}`);
      return { valid: false, reason: 'Invalid or expired TOTP token.' };
    }

    // Confirm enrollment on first successful verification
    if (!enrollment.confirmed) {
      enrollment.confirmed = true;
      enrollmentStore.set(userId, enrollment);
      this.logger.log(`MFA enrollment confirmed for user ${userId}`);
    }

    return { valid: true };
  }

  // -------------------------------------------------------------------------
  // Backup Recovery Codes
  // -------------------------------------------------------------------------

  /**
   * Generate 10 single-use backup recovery codes for a user.
   *
   * Recovery codes provide an alternative authentication path when the user
   * has lost access to their authenticator app. Each code can only be used
   * once. Codes are stored as SHA-256 hashes; plaintext codes are returned
   * only during generation and must be saved by the user.
   *
   * Codes use an unambiguous character set (no I/1, O/0) and are formatted
   * as XXXXX-XXXXX for readability.
   *
   * @param userId - The user's unique identifier
   * @returns Array of plaintext backup codes (display once, then discard)
   *
   * @see NIST SP 800-63B Section 5.1.4.1 — Look-Up Secrets
   */
  generateBackupCodes(userId: string): BackupCode[] {
    const enrollment = enrollmentStore.get(userId);
    if (!enrollment) {
      this.logger.warn(
        `Cannot generate backup codes: user ${userId} is not enrolled in MFA`,
      );
      return [];
    }

    const codes: BackupCode[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const bytes = randomBytes(BACKUP_CODE_LENGTH);
      let raw = '';
      for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
        raw += RECOVERY_CHARS[bytes[j] % RECOVERY_CHARS.length];
      }
      // Format as XXXXX-XXXXX for readability
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      const hash = this.hashCode(code);

      codes.push({ code, hash, consumed: false });
    }

    // Store hashed codes
    enrollment.backupCodesHashed = codes.map(c => c.hash);
    enrollmentStore.set(userId, enrollment);

    this.logger.log(`Generated ${BACKUP_CODE_COUNT} backup codes for user ${userId}`);

    return codes;
  }

  /**
   * Consume a single-use backup recovery code.
   *
   * Validates the code against stored hashes using constant-time comparison,
   * then removes it from the available pool. Logs a warning when the user
   * is running low on remaining codes.
   *
   * @param userId - The user's unique identifier
   * @param code - The backup code to consume
   * @returns Verification result with remaining code count
   *
   * @see NIST SP 800-63B Section 5.1.4.1 — Look-Up Secrets
   */
  consumeBackupCode(userId: string, code: string): MFAVerification {
    const enrollment = enrollmentStore.get(userId);
    if (!enrollment) {
      return { valid: false, reason: 'MFA is not enrolled for this user.' };
    }

    if (!enrollment.confirmed) {
      return { valid: false, reason: 'MFA enrollment is not yet confirmed.' };
    }

    if (enrollment.revokedAt) {
      return { valid: false, reason: 'MFA enrollment has been revoked.' };
    }

    // Normalize input: strip dashes/spaces, uppercase
    const normalized = code.replace(/[-\s]/g, '').toUpperCase();
    const inputHash = this.hashCode(normalized);

    // Find matching code via constant-time comparison
    const matchIndex = enrollment.backupCodesHashed.findIndex(storedHash =>
      this.constantTimeEqual(inputHash, storedHash),
    );

    if (matchIndex === -1) {
      this.logger.warn(`Invalid backup code attempt for user ${userId}`);
      return { valid: false, reason: 'Invalid backup code.' };
    }

    // Remove the consumed code (single-use)
    enrollment.backupCodesHashed.splice(matchIndex, 1);
    enrollmentStore.set(userId, enrollment);

    const remaining = enrollment.backupCodesHashed.length;

    this.logger.log(
      `Backup code consumed for user ${userId}. ${remaining} codes remaining.`,
    );

    if (remaining <= 2) {
      this.logger.warn(
        `User ${userId} has only ${remaining} backup codes remaining. ` +
          'New codes should be generated.',
      );
    }

    return {
      valid: true,
      usedBackupCode: true,
      backupCodesRemaining: remaining,
    };
  }

  // -------------------------------------------------------------------------
  // MFA Policy Enforcement
  // -------------------------------------------------------------------------

  /**
   * Check whether MFA is required for a given user role.
   *
   * Returns a policy result indicating whether MFA is required and the
   * regulatory justification. Privileged roles (admin, certifying_officer)
   * always require MFA. Unknown roles default to required (fail-secure).
   *
   * @param userRole - The user's role identifier
   * @returns Policy result with requirement flag and reason
   *
   * @see NIST SP 800-63B Section 4.2 — AAL2 Requirements
   * @see DoD Instruction 8520.02 — PKI and Public Key Enabling
   */
  checkMFARequired(userRole: string): { required: boolean; reason: string } {
    const policy = policyMap.get(userRole);

    if (!policy) {
      // Fail-secure: unknown roles require MFA
      return {
        required: true,
        reason:
          'MFA required for unrecognized roles (fail-secure policy per NIST SP 800-53 IA-2).',
      };
    }

    return {
      required: policy.required,
      reason: policy.reason,
    };
  }

  /**
   * Determine whether an authentication method is exempt from MFA.
   *
   * Per NIST SP 800-63B, PKI-based authentication via hardware token
   * (CAC/PIV) satisfies multi-factor requirements at AAL2 and AAL3
   * because the smartcard is "something you have" and the PIN is
   * "something you know." Users authenticated via CAC/PIV bypass
   * separate MFA prompts.
   *
   * @param authMethod - The authentication method used (e.g., 'cac_piv', 'password')
   * @returns Whether the auth method is exempt from additional MFA
   *
   * @see NIST SP 800-63B Section 4.2.1 — Permitted Authenticator Types (AAL2)
   * @see DoD Instruction 8520.02 — PKI multi-factor equivalence
   */
  isMFAExempt(authMethod: string): {
    exempt: boolean;
    reason: string;
  } {
    const normalized = authMethod.toLowerCase().replace(/[\s-]/g, '_');

    if (
      (MFA_EXEMPT_AUTH_METHODS as readonly string[]).includes(normalized)
    ) {
      return {
        exempt: true,
        reason:
          'CAC/PIV authentication satisfies MFA requirements per NIST SP 800-63B ' +
          '(hardware token + PIN = AAL2/AAL3). Ref: DoD Instruction 8520.02.',
      };
    }

    return {
      exempt: false,
      reason: `Authentication method "${authMethod}" does not satisfy MFA; ` +
        'additional factor required.',
    };
  }

  // -------------------------------------------------------------------------
  // Enrollment Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the MFA enrollment flow for a user.
   *
   * Generates a TOTP secret, creates backup codes, and stores the enrollment
   * in an unconfirmed state. The enrollment is confirmed when the user
   * successfully verifies their first TOTP token.
   *
   * @param userId - The user's unique identifier
   * @returns Enrollment record with secret, provisioning URI, and backup codes
   */
  enrollMFA(userId: string): {
    enrollment: MFAEnrollment;
    mfaSecret: MFASecret;
    backupCodes: BackupCode[];
  } {
    // Check for existing active enrollment
    const existing = enrollmentStore.get(userId);
    if (existing && existing.confirmed && !existing.revokedAt) {
      this.logger.warn(
        `User ${userId} already has active MFA enrollment. Revoke first to re-enroll.`,
      );
      return {
        enrollment: this.toMFAEnrollment(userId, existing),
        mfaSecret: {
          secret: existing.secret,
          provisioningUri: this.buildProvisioningUri(existing.secret, userId),
          algorithm: TOTP_CONFIG.algorithm.toUpperCase(),
          digits: TOTP_CONFIG.digits,
          period: TOTP_CONFIG.period,
        },
        backupCodes: [],
      };
    }

    // Generate TOTP secret
    const mfaSecret = this.generateTOTPSecret(userId);

    // Store enrollment (unconfirmed)
    const enrolledAt = new Date().toISOString();
    enrollmentStore.set(userId, {
      secret: mfaSecret.secret,
      confirmed: false,
      backupCodesHashed: [],
      enrolledAt,
    });

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(userId);

    const enrollment = this.toMFAEnrollment(userId, enrollmentStore.get(userId)!);

    this.logger.log(`MFA enrollment initiated for user ${userId}`);

    return { enrollment, mfaSecret, backupCodes };
  }

  /**
   * Revoke MFA enrollment for a user.
   *
   * Marks the enrollment as revoked rather than deleting it, preserving
   * an audit trail. After revocation, the user must re-enroll to use MFA.
   *
   * @param userId - The user's unique identifier
   * @returns Result indicating success or failure
   */
  revokeMFA(userId: string): { success: boolean; reason: string } {
    const enrollment = enrollmentStore.get(userId);

    if (!enrollment) {
      return {
        success: false,
        reason: `User ${userId} does not have an MFA enrollment to revoke.`,
      };
    }

    if (enrollment.revokedAt) {
      return {
        success: false,
        reason: `MFA enrollment for user ${userId} was already revoked at ${enrollment.revokedAt}.`,
      };
    }

    enrollment.revokedAt = new Date().toISOString();
    enrollment.backupCodesHashed = [];
    enrollmentStore.set(userId, enrollment);

    this.logger.log(`MFA enrollment revoked for user ${userId}`);

    return {
      success: true,
      reason: `MFA enrollment revoked for user ${userId}.`,
    };
  }

  // -------------------------------------------------------------------------
  // Status and Policy Queries
  // -------------------------------------------------------------------------

  /**
   * Get the current MFA status for a user, considering role and auth method.
   *
   * @param userId - The user's unique identifier
   * @param role - The user's role
   * @param authMethod - The authentication method used
   * @returns Combined MFA status
   */
  getMFAStatus(
    userId: string,
    role: string,
    authMethod: string = 'password',
  ): {
    enrolled: boolean;
    confirmed: boolean;
    required: boolean;
    exempt: boolean;
    backupCodesRemaining: number;
    bypassReason?: string;
  } {
    const enrollment = enrollmentStore.get(userId);
    const { required } = this.checkMFARequired(role);
    const { exempt, reason: exemptReason } = this.isMFAExempt(authMethod);

    return {
      enrolled: !!enrollment && !enrollment.revokedAt,
      confirmed: enrollment?.confirmed ?? false,
      required: exempt ? false : required,
      exempt,
      backupCodesRemaining: enrollment?.backupCodesHashed.length ?? 0,
      bypassReason: exempt ? exemptReason : undefined,
    };
  }

  /**
   * Get all MFA enforcement policies.
   * Used for compliance documentation and administrative review.
   */
  getMFAPolicies(): MFAPolicy[] {
    return [...MFA_POLICIES];
  }

  // -------------------------------------------------------------------------
  // TOTP Implementation (RFC 6238 / RFC 4226)
  // -------------------------------------------------------------------------

  /**
   * Compute a TOTP value per RFC 6238.
   *
   * TOTP(K, T) = HOTP(K, T) where T = floor(unixTime / period).
   * HOTP is defined in RFC 4226 as Truncate(HMAC-SHA-1(K, C)).
   *
   * Uses the Node.js crypto module for HMAC computation rather than
   * an external TOTP library.
   *
   * @param secret - Base32-encoded TOTP secret
   * @param timeCounter - Time step counter value
   * @returns 6-digit TOTP string (zero-padded)
   *
   * @see RFC 6238 Section 4 — TOTP Algorithm
   * @see RFC 4226 Section 5.3 — Generating an HOTP Value
   * @see RFC 4226 Section 5.4 — Dynamic Truncation
   */
  private computeTOTP(secret: string, timeCounter: number): string {
    // Decode Base32 secret to raw bytes
    const keyBytes = this.decodeBase32(secret);

    // Encode time counter as 8-byte big-endian integer (RFC 4226 Section 5.2)
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(0, 0);
    timeBuffer.writeUInt32BE(timeCounter, 4);

    // HMAC-SHA-1 per RFC 4226 Section 5.3
    const hmac = createHmac(TOTP_CONFIG.algorithm, keyBytes);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    // Dynamic Truncation per RFC 4226 Section 5.4
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    // Modulo to get N-digit code
    const otp = binary % Math.pow(10, TOTP_CONFIG.digits);
    return otp.toString().padStart(TOTP_CONFIG.digits, '0');
  }

  // -------------------------------------------------------------------------
  // Provisioning URI
  // -------------------------------------------------------------------------

  /**
   * Build an otpauth:// provisioning URI for QR code generation.
   *
   * Format:
   *   otpauth://totp/{issuer}:{account}?secret={s}&issuer={i}&algorithm={a}&digits={d}&period={p}
   *
   * @param secret - Base32-encoded TOTP secret
   * @param account - Account label (user ID or email)
   * @returns otpauth:// URI string
   */
  private buildProvisioningUri(secret: string, account: string): string {
    const params = new URLSearchParams({
      secret,
      issuer: TOTP_ISSUER,
      algorithm: TOTP_CONFIG.algorithm.toUpperCase(),
      digits: TOTP_CONFIG.digits.toString(),
      period: TOTP_CONFIG.period.toString(),
    });

    const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  // -------------------------------------------------------------------------
  // Base32 Encoding/Decoding (RFC 4648)
  // -------------------------------------------------------------------------

  /**
   * Encode a buffer to Base32 per RFC 4648.
   */
  private encodeBase32(buffer: Buffer): string {
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
      }
    }

    if (bits > 0) {
      result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }

    return result;
  }

  /**
   * Decode a Base32 string to a buffer per RFC 4648.
   */
  private decodeBase32(encoded: string): Buffer {
    const cleaned = encoded.replace(/=+$/, '').toUpperCase();
    const bytes: number[] = [];
    let bits = 0;
    let value = 0;

    for (const char of cleaned) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index === -1) continue;

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bits -= 8;
        bytes.push((value >>> bits) & 0xff);
      }
    }

    return Buffer.from(bytes);
  }

  // -------------------------------------------------------------------------
  // Hashing and Security Utilities
  // -------------------------------------------------------------------------

  /**
   * Hash a backup code for secure storage using SHA-256.
   *
   * Recovery codes are stored as hashes so plaintext codes cannot be
   * recovered from a database compromise.
   */
  private hashCode(code: string): string {
    return createHash('sha256')
      .update(code.replace(/[-\s]/g, '').toUpperCase())
      .digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   *
   * Per NIST SP 800-63B Section 5.1.4.2, verifiers must use constant-time
   * comparison when validating authentication secrets.
   */
  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i] ^ bufB[i];
    }

    return result === 0;
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert an internal enrollment record to the public MFAEnrollment type.
   */
  private toMFAEnrollment(
    userId: string,
    record: {
      secret: string;
      confirmed: boolean;
      backupCodesHashed: string[];
      enrolledAt: string;
      revokedAt?: string;
    },
  ): MFAEnrollment {
    return {
      userId,
      secret: record.secret,
      confirmed: record.confirmed,
      backupCodesHashed: record.backupCodesHashed,
      backupCodesRemaining: record.backupCodesHashed.length,
      enrolledAt: record.enrolledAt,
      revokedAt: record.revokedAt,
    };
  }
}
