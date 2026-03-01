/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Server-side only module using Node.js crypto
/**
 * FIPS 140-2 / 140-3 Compliance Mode
 *
 * Validates and enforces FIPS-compliant cryptographic operations for the DoD
 * financial audit platform. Provides runtime checks to ensure that only
 * FIPS-approved algorithms, cipher suites, and TLS configurations are in use.
 *
 * FIPS 140-2 (and its successor FIPS 140-3) mandate the use of validated
 * cryptographic modules for federal information systems. This module does not
 * implement the cryptographic primitives itself but verifies that the Node.js
 * runtime and application configuration adhere to FIPS requirements.
 *
 * Capabilities:
 *   - Enable/verify FIPS mode for the Node.js crypto module
 *   - Validate cipher suites against the FIPS-approved whitelist
 *   - Validate TLS configuration (TLS 1.2+ only, approved suites)
 *   - Detect non-FIPS algorithms in use
 *   - Generate FIPS compliance reports for auditing
 *
 * FIPS-approved algorithms (subset relevant to this platform):
 *   - Symmetric:  AES-128-GCM, AES-256-GCM, AES-128-CBC, AES-256-CBC
 *   - Hash:       SHA-256, SHA-384, SHA-512
 *   - MAC:        HMAC-SHA-256, HMAC-SHA-384, HMAC-SHA-512
 *   - Asymmetric: RSA (2048+), ECDSA (P-256, P-384, P-521)
 *
 * Non-FIPS algorithms (must be detected and rejected):
 *   - MD5, SHA-1 (for signing), RC4, DES, 3DES (after 2023), Blowfish
 *
 * References:
 *   - FIPS 140-2: Security Requirements for Cryptographic Modules
 *   - FIPS 140-3: Security Requirements for Cryptographic Modules (successor)
 *   - NIST SP 800-52 Rev. 2: Guidelines for the Selection, Configuration,
 *     and Use of TLS Implementations
 *   - NIST SP 800-175B: Guideline for Using Cryptographic Standards
 *   - DoD Instruction 8580.1: Information Assurance in the Defense
 *     Acquisition System
 *   - CNSSP 15: Use of Public Standards for Secure Sharing
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** FIPS mode operational status. */
export interface FIPSStatus {
  /** Whether FIPS mode is currently active in the Node.js crypto module */
  enabled: boolean;
  /** Human-readable status description */
  description: string;
  /** Node.js OpenSSL version string */
  opensslVersion: string;
  /** Whether the OpenSSL build supports FIPS */
  fipsCapable: boolean;
  /** Timestamp of the status check (ISO 8601) */
  checkedAt: string;
}

/** Result of validating a cipher suite against the FIPS whitelist. */
export interface CipherValidation {
  /** The cipher suite that was validated */
  cipher: string;
  /** Whether the cipher is FIPS-approved */
  approved: boolean;
  /** Reason for approval or rejection */
  reason: string;
  /** Suggested FIPS-approved alternative (if rejected) */
  alternative?: string;
}

/** Result of validating a TLS configuration. */
export interface TLSValidation {
  /** Whether the TLS configuration is FIPS-compliant */
  compliant: boolean;
  /** Minimum TLS version configured */
  minVersion: string;
  /** List of non-compliant settings found */
  violations: string[];
  /** Recommendations for achieving compliance */
  recommendations: string[];
}

/** Comprehensive FIPS compliance report for audit purposes. */
export interface FIPSComplianceReport {
  /** Overall compliance status */
  compliant: boolean;
  /** FIPS mode status */
  fipsStatus: FIPSStatus;
  /** TLS configuration validation */
  tlsValidation: TLSValidation;
  /** Non-FIPS algorithms detected in the runtime environment */
  nonFIPSAlgorithmsDetected: string[];
  /** FIPS-approved ciphers available in the current runtime */
  approvedCiphersAvailable: string[];
  /** FIPS-approved hashes available in the current runtime */
  approvedHashesAvailable: string[];
  /** Report generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Regulatory citations */
  citations: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * FIPS-approved symmetric cipher suites.
 *
 * Per NIST SP 800-175B and FIPS 197 (AES), only AES with approved modes
 * of operation is permitted for symmetric encryption in FIPS environments.
 *
 * GCM (Galois/Counter Mode) provides authenticated encryption (AEAD) and
 * is preferred. CBC is permitted but requires separate integrity protection.
 */
const FIPS_APPROVED_CIPHERS: readonly string[] = [
  'aes-128-gcm',
  'aes-256-gcm',
  'aes-128-cbc',
  'aes-256-cbc',
] as const;

/**
 * FIPS-approved hash algorithms.
 *
 * Per FIPS 180-4 (Secure Hash Standard), SHA-2 family algorithms are
 * approved. SHA-1 is deprecated for digital signatures per NIST SP
 * 800-131A Rev. 2 but remains permitted for HMAC (e.g., TOTP per RFC 6238).
 * MD5 is prohibited for all uses.
 */
const FIPS_APPROVED_HASHES: readonly string[] = [
  'sha-256',
  'sha-384',
  'sha-512',
] as const;

/**
 * Algorithms explicitly prohibited under FIPS 140-2/140-3.
 *
 * Each entry maps an algorithm identifier to a human-readable rejection
 * reason with a regulatory citation.
 */
const NON_FIPS_ALGORITHMS: ReadonlyMap<string, { reason: string; alternative: string }> = new Map([
  ['md5', {
    reason: 'MD5 is cryptographically broken and not approved for any use. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'sha-256',
  }],
  ['md4', {
    reason: 'MD4 is cryptographically broken and must not be used.',
    alternative: 'sha-256',
  }],
  ['sha-1', {
    reason: 'SHA-1 is deprecated for digital signatures. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'sha-256',
  }],
  ['sha1', {
    reason: 'SHA-1 is deprecated for digital signatures. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'sha-256',
  }],
  ['des', {
    reason: 'DES has a 56-bit key and is prohibited. Ref: NIST SP 800-131A.',
    alternative: 'aes-256-cbc',
  }],
  ['des-cbc', {
    reason: 'DES is prohibited. Ref: NIST SP 800-131A.',
    alternative: 'aes-256-cbc',
  }],
  ['des-ede', {
    reason: 'Two-key Triple DES is deprecated. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'aes-256-cbc',
  }],
  ['des-ede3', {
    reason: 'Three-key Triple DES is deprecated after 2023. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'aes-256-cbc',
  }],
  ['3des', {
    reason: 'Triple DES is deprecated after 2023. Ref: NIST SP 800-131A Rev. 2.',
    alternative: 'aes-256-cbc',
  }],
  ['rc4', {
    reason: 'RC4 is prohibited. Ref: RFC 7465, NIST SP 800-52 Rev. 2.',
    alternative: 'aes-256-gcm',
  }],
  ['rc2', {
    reason: 'RC2 is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
  ['blowfish', {
    reason: 'Blowfish is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
  ['bf', {
    reason: 'Blowfish (bf) is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
  ['idea', {
    reason: 'IDEA is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
  ['seed', {
    reason: 'SEED is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
  ['camellia', {
    reason: 'Camellia is not a FIPS-approved algorithm.',
    alternative: 'aes-256-cbc',
  }],
]);

/**
 * Minimum acceptable TLS version per NIST SP 800-52 Rev. 2.
 * TLS 1.0 and 1.1 are prohibited.
 */
const MINIMUM_TLS_VERSION = 'TLSv1.2';

/** TLS versions prohibited under FIPS / NIST SP 800-52 Rev. 2. */
const PROHIBITED_TLS_VERSIONS = new Set(['SSLv2', 'SSLv3', 'TLSv1', 'TLSv1.1']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enable FIPS mode for Node.js crypto operations.
 *
 * When FIPS mode is enabled, only FIPS-validated algorithms are available
 * from the Node.js crypto module. Attempting to use a non-FIPS algorithm
 * will cause the crypto layer to throw at the OpenSSL level.
 *
 * This requires Node.js to be built with a FIPS-validated OpenSSL provider
 * (OpenSSL 3.x FIPS module). If the provider is unavailable, the function
 * returns a status indicating the failure without throwing.
 *
 * Must be called at application startup before any cryptographic operations.
 *
 * @returns FIPS status after the enable attempt
 *
 * @see FIPS 140-2 Section 4.9.1 -- Self-Tests
 * @see FIPS 140-3 Section 9.1 -- Power-Up Tests
 * @see DoD Instruction 8580.1
 */
export function enableFIPSMode(): FIPSStatus {
  try {
    if (typeof crypto.setFips === 'function') {
      crypto.setFips(1);
    } else {
      // Legacy Node.js: set via fips property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (crypto as any).fips = 1;
    }

    const status = verifyFIPSStatus();

    if (status.enabled) {
      console.log('[FIPS] FIPS 140-2/140-3 mode enabled successfully.');
    }

    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      enabled: false,
      description:
        `Failed to enable FIPS mode: ${message}. ` +
        'Ensure Node.js is built with a FIPS-validated OpenSSL provider. ' +
        'Ref: FIPS 140-2/140-3, DoD Instruction 8580.1.',
      opensslVersion: getOpenSSLVersion(),
      fipsCapable: false,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check if FIPS mode is currently active.
 *
 * Queries the Node.js crypto module's FIPS status flag and reports on
 * the underlying OpenSSL configuration.
 *
 * @returns Current FIPS mode status
 *
 * @see FIPS 140-2 Section 4.2 -- Cryptographic Module Ports and Interfaces
 */
export function verifyFIPSStatus(): FIPSStatus {
  let enabled = false;

  try {
    if (typeof crypto.getFips === 'function') {
      enabled = crypto.getFips() === 1;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enabled = (crypto as any).fips === 1;
    }
  } catch {
    enabled = false;
  }

  const opensslVersion = getOpenSSLVersion();
  const fipsCapable =
    opensslVersion.toLowerCase().includes('fips') ||
    typeof crypto.setFips === 'function';

  return {
    enabled,
    description: enabled
      ? 'FIPS mode is active. Only FIPS-validated algorithms are available.'
      : fipsCapable
        ? 'FIPS mode is available but not currently enabled.'
        : 'FIPS mode is not available. Node.js was not built with a FIPS-validated OpenSSL provider.',
    opensslVersion,
    fipsCapable,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Validate a cipher suite against the FIPS-approved whitelist.
 *
 * @param suite - The cipher suite identifier to validate (e.g., 'aes-256-gcm')
 * @returns Validation result with approval status, reason, and alternative
 *
 * @see FIPS 197: Advanced Encryption Standard (AES)
 * @see NIST SP 800-38D: Recommendation for GCM Mode
 */
export function validateCipherSuite(suite: string): CipherValidation {
  const normalized = suite.toLowerCase().trim();

  // Check approved list
  if (FIPS_APPROVED_CIPHERS.includes(normalized)) {
    return {
      cipher: suite,
      approved: true,
      reason: `"${suite}" is a FIPS-approved cipher. Ref: FIPS 197, NIST SP 800-38D.`,
    };
  }

  // Check known non-FIPS algorithms
  for (const [algo, info] of Array.from(NON_FIPS_ALGORITHMS.entries())) {
    if (normalized === algo || normalized.includes(algo)) {
      return {
        cipher: suite,
        approved: false,
        reason: `"${suite}" is not FIPS-approved. ${info.reason}`,
        alternative: info.alternative,
      };
    }
  }

  // Unknown algorithm -- not on the approved list
  return {
    cipher: suite,
    approved: false,
    reason:
      `"${suite}" is not on the FIPS-approved cipher whitelist. ` +
      `Approved ciphers: ${FIPS_APPROVED_CIPHERS.join(', ')}. Ref: FIPS 140-2.`,
  };
}

/**
 * Return the list of FIPS-approved symmetric cipher suites.
 *
 * @returns Array of approved cipher identifiers
 *
 * @see FIPS 197 -- AES
 * @see NIST SP 800-38D -- GCM
 * @see NIST SP 800-38A -- CBC
 */
export function getFIPSApprovedCiphers(): string[] {
  return [...FIPS_APPROVED_CIPHERS];
}

/**
 * Return the list of FIPS-approved hash algorithms.
 *
 * @returns Array of approved hash algorithm identifiers
 *
 * @see FIPS 180-4: Secure Hash Standard (SHS)
 */
export function getFIPSApprovedHashes(): string[] {
  return [...FIPS_APPROVED_HASHES];
}

/**
 * Validate a TLS configuration for FIPS compliance.
 *
 * Ensures the configuration enforces TLS 1.2 or higher and uses only
 * FIPS-approved cipher suites, per NIST SP 800-52 Rev. 2.
 *
 * @param config - TLS configuration object
 * @returns Validation result with violations and recommendations
 *
 * @see NIST SP 800-52 Rev. 2: Guidelines for the Selection, Configuration,
 *      and Use of TLS Implementations
 * @see DoD Instruction 8580.1 Section 6.3 -- Encryption Requirements
 */
export function validateTLSConfig(config: {
  minVersion?: string;
  maxVersion?: string;
  ciphers?: string[];
  rejectUnauthorized?: boolean;
}): TLSValidation {
  const violations: string[] = [];
  const recommendations: string[] = [];

  // --- Minimum TLS version ---
  const minVersion = config.minVersion || '';
  if (!minVersion) {
    violations.push(
      'No minimum TLS version specified. TLS 1.2 is required per NIST SP 800-52 Rev. 2.',
    );
    recommendations.push(`Set minVersion to "${MINIMUM_TLS_VERSION}" or higher.`);
  } else if (PROHIBITED_TLS_VERSIONS.has(minVersion)) {
    violations.push(
      `TLS version "${minVersion}" is prohibited. Minimum is ${MINIMUM_TLS_VERSION} ` +
        'per NIST SP 800-52 Rev. 2.',
    );
    recommendations.push(`Upgrade minVersion to "${MINIMUM_TLS_VERSION}" or "TLSv1.3".`);
  }

  if (minVersion === MINIMUM_TLS_VERSION) {
    recommendations.push(
      'Consider upgrading to TLS 1.3 for improved security and performance.',
    );
  }

  // --- Cipher suites ---
  if (config.ciphers && config.ciphers.length > 0) {
    for (const cipher of config.ciphers) {
      const validation = validateCipherSuite(cipher);
      if (!validation.approved) {
        violations.push(
          `Non-FIPS cipher suite "${cipher}" found in TLS config. ${validation.reason}`,
        );
      }
    }
  }

  // --- Certificate validation ---
  if (config.rejectUnauthorized === false) {
    violations.push(
      'rejectUnauthorized is false, disabling certificate verification. ' +
        'This violates NIST SP 800-52 Rev. 2 Section 3.4.',
    );
    recommendations.push(
      'Set rejectUnauthorized to true for production environments.',
    );
  }

  return {
    compliant: violations.length === 0,
    minVersion: minVersion || 'not specified',
    violations,
    recommendations,
  };
}

/**
 * Check if an algorithm is a known non-FIPS algorithm.
 *
 * Detects prohibited algorithms such as MD5, SHA-1, DES, RC4, and others
 * that do not meet FIPS 140-2/140-3 requirements.
 *
 * @param algorithm - The algorithm identifier to check
 * @returns Detection result with explanation and suggested alternative
 *
 * @see NIST SP 800-131A Rev. 2: Transitioning the Use of Cryptographic
 *      Algorithms and Key Lengths
 */
export function detectNonFIPSAlgorithm(algorithm: string): {
  nonFIPS: boolean;
  algorithm: string;
  reason: string;
  alternative?: string;
} {
  const normalized = algorithm.toLowerCase().trim();

  // Direct match
  const entry = NON_FIPS_ALGORITHMS.get(normalized);
  if (entry) {
    return {
      nonFIPS: true,
      algorithm,
      reason: entry.reason,
      alternative: entry.alternative,
    };
  }

  // Partial match (e.g., 'des-cbc-sha' contains 'des')
  for (const [algo, info] of Array.from(NON_FIPS_ALGORITHMS.entries())) {
    if (normalized.includes(algo) && !normalized.includes('aes')) {
      return {
        nonFIPS: true,
        algorithm,
        reason: info.reason,
        alternative: info.alternative,
      };
    }
  }

  // Check if it is on the approved lists
  const isApprovedCipher = FIPS_APPROVED_CIPHERS.includes(normalized);
  const isApprovedHash = FIPS_APPROVED_HASHES.includes(normalized) ||
    FIPS_APPROVED_HASHES.includes(normalized.replace(/^sha(\d)/, 'sha-$1'));

  if (isApprovedCipher || isApprovedHash) {
    return {
      nonFIPS: false,
      algorithm,
      reason: `"${algorithm}" is a FIPS-approved algorithm.`,
    };
  }

  return {
    nonFIPS: false,
    algorithm,
    reason:
      `"${algorithm}" is not recognized as a known non-FIPS algorithm, ` +
      'but verify it appears on the FIPS-approved list before use in production.',
  };
}

/**
 * Generate a comprehensive FIPS compliance report.
 *
 * Produces a report covering FIPS mode status, available approved algorithms,
 * TLS configuration, and detected non-FIPS usage. Suitable for inclusion in
 * ATO (Authority to Operate) documentation and continuous monitoring.
 *
 * @returns FIPS compliance report
 *
 * @see FIPS 140-2: Security Requirements for Cryptographic Modules
 * @see FIPS 140-3: Security Requirements for Cryptographic Modules
 * @see NIST SP 800-52 Rev. 2: Guidelines for TLS Implementations
 * @see DoD Instruction 8580.1: Information Assurance
 */
export function generateFIPSComplianceReport(): FIPSComplianceReport {
  const fipsStatus = verifyFIPSStatus();

  // Determine which approved ciphers are available in the runtime
  const runtimeCiphers = crypto.getCiphers();
  const approvedCiphersAvailable = FIPS_APPROVED_CIPHERS.filter(c =>
    runtimeCiphers.includes(c),
  );

  // Determine which approved hashes are available
  const runtimeHashes = crypto.getHashes();
  const approvedHashesAvailable = FIPS_APPROVED_HASHES.filter(h => {
    const withoutDash = h.replace(/-/g, '');
    return runtimeHashes.includes(withoutDash) || runtimeHashes.includes(h);
  });

  // Detect non-FIPS algorithms present in the runtime
  const nonFIPSAlgorithmsDetected: string[] = [];
  const allAlgorithms = [...runtimeCiphers, ...runtimeHashes];
  for (const algo of allAlgorithms) {
    const detection = detectNonFIPSAlgorithm(algo);
    if (detection.nonFIPS) {
      nonFIPSAlgorithmsDetected.push(algo);
    }
  }
  // Deduplicate
  const uniqueNonFIPS = Array.from(new Set(nonFIPSAlgorithmsDetected));

  // Validate default TLS settings
  const tlsValidation = validateTLSConfig({
    minVersion: MINIMUM_TLS_VERSION,
    rejectUnauthorized: true,
  });

  const compliant =
    fipsStatus.enabled &&
    tlsValidation.compliant &&
    approvedCiphersAvailable.length > 0 &&
    approvedHashesAvailable.length > 0;

  return {
    compliant,
    fipsStatus,
    tlsValidation,
    nonFIPSAlgorithmsDetected: uniqueNonFIPS,
    approvedCiphersAvailable: [...approvedCiphersAvailable],
    approvedHashesAvailable: [...approvedHashesAvailable],
    generatedAt: new Date().toISOString(),
    citations: [
      'FIPS 140-2: Security Requirements for Cryptographic Modules',
      'FIPS 140-3: Security Requirements for Cryptographic Modules',
      'NIST SP 800-52 Rev. 2: Guidelines for TLS Implementations',
      'NIST SP 800-131A Rev. 2: Transitioning Cryptographic Algorithms',
      'NIST SP 800-175B: Guideline for Using Cryptographic Standards',
      'DoD Instruction 8580.1: Information Assurance in the Defense Acquisition System',
    ],
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Get the OpenSSL version string from the Node.js runtime.
 */
function getOpenSSLVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (process.versions as any).openssl || 'unknown';
  } catch {
    return 'unknown';
  }
}
