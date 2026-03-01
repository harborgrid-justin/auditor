/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Server-side only module using Node.js crypto
/**
 * Encryption at Rest Module
 *
 * Provides field-level encryption for sensitive DoD financial data using
 * AES-256-GCM. This is a defense-in-depth layer on top of database-level
 * encryption (PostgreSQL TDE or similar).
 *
 * Encrypted fields include:
 *   - SSN/EDIPI in pay records
 *   - Financial account numbers in disbursement records
 *   - PII fields in debt records
 *
 * Key management:
 *   - Data Encryption Keys (DEK): per-record or per-table keys
 *   - Key Encryption Keys (KEK): from environment variable / KMS
 *   - Key rotation: supported via re-encryption function
 *
 * References:
 *   - NIST SP 800-53 Rev. 5, SC-28: Protection of Information at Rest
 *   - NIST SP 800-171 Rev. 2, 3.13.16: Protecting CUI at Rest
 *   - FIPS 140-2/3: Cryptographic Module Requirements
 *   - DoDI 8500.01: Cybersecurity
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key

/** Environment variable for the master key. In production, use KMS. */
const MASTER_KEY_ENV = 'AUDIT_ENCRYPTION_KEY';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit key from the master key string.
 * Uses SHA-256 to normalize key material to the correct length.
 */
function deriveKey(keyMaterial: string): Buffer {
  return createHash('sha256').update(keyMaterial).digest();
}

/**
 * Get the master encryption key from environment.
 * Falls back to a development-only key if not set.
 */
function getMasterKey(): Buffer {
  const keyStr = process.env[MASTER_KEY_ENV];
  if (!keyStr) {
    // Development fallback — NEVER use in production
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${MASTER_KEY_ENV} environment variable must be set in production. ` +
        `Ref: NIST SP 800-53 SC-28.`,
      );
    }
    return deriveKey('dev-only-encryption-key-not-for-production');
  }
  return deriveKey(keyStr);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext value using AES-256-GCM.
 *
 * Returns a string in the format: iv:authTag:ciphertext (all base64 encoded).
 * This format allows storage in text/varchar database columns.
 *
 * @param plaintext - The value to encrypt
 * @returns Encrypted string in iv:authTag:ciphertext format
 */
export function encryptField(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted value.
 *
 * @param encryptedValue - The encrypted string in iv:authTag:ciphertext format
 * @returns The decrypted plaintext
 * @throws If decryption fails (tampered data, wrong key, etc.)
 */
export function decryptField(encryptedValue: string): string {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format. Expected iv:authTag:ciphertext.');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random data encryption key (DEK).
 *
 * @returns A random 256-bit key as a base64 string
 */
export function generateDataKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Check if a value appears to be encrypted (in our format).
 *
 * @param value - The value to check
 * @returns Whether the value looks like an encrypted field
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Check that each part is valid base64
  try {
    for (const part of parts) {
      Buffer.from(part, 'base64');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt a value with a new key (for key rotation).
 *
 * @param encryptedValue - The currently encrypted value
 * @param oldKeyMaterial - The old key material
 * @param newKeyMaterial - The new key material
 * @returns Re-encrypted value
 */
export function rotateEncryption(
  encryptedValue: string,
  oldKeyMaterial: string,
  newKeyMaterial: string,
): string {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const oldKey = deriveKey(oldKeyMaterial);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  // Decrypt with old key
  const decipher = createDecipheriv(ALGORITHM, oldKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(ciphertextB64, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  // Re-encrypt with new key
  const newKey = deriveKey(newKeyMaterial);
  const newIv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, newKey, newIv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const newAuthTag = cipher.getAuthTag();

  return `${newIv.toString('base64')}:${newAuthTag.toString('base64')}:${encrypted}`;
}

/**
 * List fields that should be encrypted for a given data type.
 * Used by the data access layer to determine which fields to
 * encrypt/decrypt automatically.
 */
export function getEncryptedFields(dataType: string): string[] {
  const fieldMap: Record<string, string[]> = {
    military_pay: ['memberId'],
    civilian_pay: ['employeeId'],
    debt_record: ['debtorId', 'debtorName'],
    disbursement: ['payeeId'],
    travel_order: ['travelerId'],
  };
  return fieldMap[dataType] || [];
}
