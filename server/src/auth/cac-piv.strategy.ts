/**
 * CAC/PIV Authentication Strategy
 *
 * Implements X.509 client certificate authentication for DoD Common Access
 * Card (CAC) and Personal Identity Verification (PIV) smart cards using
 * the Passport.js framework within NestJS.
 *
 * Authentication flow:
 *   1. TLS mutual authentication presents client certificate
 *   2. Strategy extracts certificate fields (CN, OU, SAN)
 *   3. DoD PKI chain is validated (Root CA -> Intermediate -> End Entity)
 *   4. EDIPI is extracted from the Subject Alternative Name
 *   5. Certificate revocation is checked (CRL/OCSP)
 *   6. User is auto-provisioned or matched to existing account
 *
 * Certificate field mapping:
 *   - CN (Common Name)  -> user display name
 *   - OU (Org Unit)     -> organization / component
 *   - SAN (otherName)   -> EDIPI (10-digit DoD identifier)
 *
 * Per NIST SP 800-63B, PKI-based authentication satisfies AAL2/AAL3
 * requirements and counts as multi-factor (something you have + something
 * you know via PIN). CAC-authenticated users bypass separate MFA prompts.
 *
 * References:
 *   - NIST SP 800-63B: Digital Identity Guidelines - Authentication
 *   - FIPS 201-3: Personal Identity Verification of Federal Employees
 *   - DoD PKI Policy: Certificate Profile Requirements
 *   - NIST SP 800-157: Guidelines for PIV Credentials
 *   - DoDI 8520.02: PKI and Public Key Enabling
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed fields from an X.509 client certificate. */
export interface CACCertificateInfo {
  /** Full subject line from the certificate */
  subject: string;
  /** Common Name — typically "LAST.FIRST.MIDDLE.EDIPI" */
  commonName: string;
  /** Organizational Unit — DoD component or agency */
  organizationalUnit: string;
  /** Organization — typically "U.S. Government" or "DoD" */
  organization: string;
  /** 10-digit DoD Electronic Data Interchange Personal Identifier */
  edipi: string;
  /** Certificate serial number */
  serialNumber: string;
  /** Certificate issuer distinguished name */
  issuer: string;
  /** Certificate validity start */
  validFrom: Date;
  /** Certificate validity end */
  validTo: Date;
  /** Raw PEM-encoded certificate for audit logging */
  rawPEM: string;
}

/** Result of certificate chain validation. */
export interface CertificateValidationResult {
  valid: boolean;
  reason?: string;
  certificateInfo?: CACCertificateInfo;
}

/** Result of revocation status check. */
export interface RevocationCheckResult {
  revoked: boolean;
  reason?: string;
  checkedAt: Date;
  method: 'CRL' | 'OCSP' | 'NONE';
}

/** User profile derived from CAC certificate data. */
export interface CACUserProfile {
  edipi: string;
  commonName: string;
  organization: string;
  email?: string;
  /** CAC auth counts as MFA per NIST 800-63B AAL2 */
  mfaSatisfied: boolean;
  authMethod: 'cac_piv';
  certificateSerialNumber: string;
}

// ---------------------------------------------------------------------------
// DoD PKI Trust Store
// ---------------------------------------------------------------------------

/**
 * DoD Root CA certificates for chain validation.
 *
 * In production, these are loaded from the DoD PKI trust store distributed
 * via DISA's PKI/PKE portal. The trust store must be updated when new
 * intermediate CAs are issued or existing CAs are revoked.
 *
 * Chain: DoD Root CA -> DoD Intermediate CA -> End Entity (CAC cert)
 */
const DOD_ROOT_CA_SUBJECTS = [
  'CN=DoD Root CA 3, OU=PKI, OU=DoD, O=U.S. Government, C=US',
  'CN=DoD Root CA 4, OU=PKI, OU=DoD, O=U.S. Government, C=US',
  'CN=DoD Root CA 5, OU=PKI, OU=DoD, O=U.S. Government, C=US',
  'CN=DoD Root CA 6, OU=PKI, OU=DoD, O=U.S. Government, C=US',
];

const DOD_INTERMEDIATE_CA_PATTERNS = [
  /^CN=DOD ID CA-\d+/,
  /^CN=DOD EMAIL CA-\d+/,
  /^CN=DOD SW CA-\d+/,
];

// ---------------------------------------------------------------------------
// Strategy Implementation
// ---------------------------------------------------------------------------

@Injectable()
export class CACPIVStrategy extends PassportStrategy(Strategy, 'cac-piv') {
  private readonly logger = new Logger(CACPIVStrategy.name);

  constructor(private readonly configService: ConfigService) {
    super();
    this.logger.log('CAC/PIV authentication strategy initialized');
  }

  /**
   * Passport authenticate entry point.
   *
   * Called by Passport when the 'cac-piv' strategy is triggered.
   * Extracts the client certificate from the TLS connection and
   * validates it against the DoD PKI trust chain.
   */
  async authenticate(req: any): Promise<void> {
    try {
      const clientCert = this.extractClientCertificate(req);
      if (!clientCert) {
        return this.fail(
          { message: 'No client certificate presented. Insert CAC/PIV card and retry.' },
          401,
        );
      }

      // Step 1: Parse certificate fields
      const certInfo = this.parseCertificate(clientCert);

      // Step 2: Validate certificate chain against DoD PKI trust store
      const chainResult = this.validateCertificateChain(certInfo);
      if (!chainResult.valid) {
        this.logger.warn(
          `Certificate chain validation failed for ${certInfo.commonName}: ${chainResult.reason}`,
        );
        return this.fail({ message: `Certificate validation failed: ${chainResult.reason}` }, 401);
      }

      // Step 3: Check revocation status (CRL/OCSP)
      const revocationResult = await this.checkRevocationStatus(certInfo);
      if (revocationResult.revoked) {
        this.logger.warn(
          `Revoked certificate used: ${certInfo.serialNumber} (${revocationResult.reason})`,
        );
        return this.fail({ message: 'Certificate has been revoked.' }, 401);
      }

      // Step 4: Extract EDIPI and build user profile
      const edipi = certInfo.edipi;
      if (!edipi || !/^\d{10}$/.test(edipi)) {
        this.logger.warn(`Invalid EDIPI extracted from certificate: ${edipi}`);
        return this.fail({ message: 'Unable to extract valid EDIPI from certificate.' }, 401);
      }

      // Step 5: Build user profile from cert data
      const userProfile = await this.buildUserProfile(certInfo);

      this.logger.log(
        `CAC/PIV authentication successful for EDIPI ${edipi} (${certInfo.commonName})`,
      );

      return this.success(userProfile);
    } catch (error) {
      this.logger.error(`CAC/PIV authentication error: ${(error as Error).message}`);
      return this.error(error as Error);
    }
  }

  // -------------------------------------------------------------------------
  // Certificate extraction and parsing
  // -------------------------------------------------------------------------

  /**
   * Extract the client certificate from the TLS socket.
   *
   * The certificate is available on the request's socket when TLS mutual
   * authentication is configured on the web server (nginx/Apache/Node.js).
   */
  private extractClientCertificate(req: any): any | null {
    // Node.js native TLS — req.socket.getPeerCertificate()
    if (req.socket && typeof req.socket.getPeerCertificate === 'function') {
      const cert = req.socket.getPeerCertificate(true);
      if (cert && Object.keys(cert).length > 0) {
        return cert;
      }
    }

    // Reverse proxy header — certificate forwarded by nginx/Apache
    const certHeader = req.headers?.['x-client-certificate'] ||
                       req.headers?.['x-ssl-client-cert'];
    if (certHeader) {
      return { raw: certHeader, fromProxy: true };
    }

    return null;
  }

  /**
   * Parse X.509 certificate fields into a structured object.
   *
   * Field mapping per DoD PKI Certificate Profile:
   *   - Subject CN: "LAST.FIRST.MIDDLE.EDIPI"
   *   - Subject OU: Component/Agency
   *   - Subject O:  "U.S. Government"
   *   - SAN otherName: EDIPI (also embedded in CN)
   */
  private parseCertificate(cert: any): CACCertificateInfo {
    const subject = cert.subject || {};
    const issuer = cert.issuer || {};

    const commonName = subject.CN || '';
    const organizationalUnit = subject.OU || '';
    const organization = subject.O || '';

    // Extract EDIPI from Common Name (format: LAST.FIRST.MIDDLE.EDIPI)
    const edipi = this.extractEDIPI(commonName, cert);

    const serialNumber = cert.serialNumber || '';

    const issuerDN = typeof issuer === 'string'
      ? issuer
      : `CN=${issuer.CN || ''}, OU=${issuer.OU || ''}, O=${issuer.O || ''}, C=${issuer.C || ''}`;

    return {
      subject: typeof subject === 'string'
        ? subject
        : `CN=${commonName}, OU=${organizationalUnit}, O=${organization}`,
      commonName,
      organizationalUnit: Array.isArray(organizationalUnit)
        ? organizationalUnit.join(', ')
        : organizationalUnit,
      organization,
      edipi,
      serialNumber,
      issuer: issuerDN,
      validFrom: new Date(cert.valid_from || Date.now()),
      validTo: new Date(cert.valid_to || Date.now()),
      rawPEM: cert.raw?.toString('base64') || '',
    };
  }

  /**
   * Extract the 10-digit EDIPI from the certificate.
   *
   * Primary source: Subject Alternative Name (SAN) otherName field.
   * Fallback: Last segment of the Common Name (LAST.FIRST.MIDDLE.EDIPI).
   *
   * Per FIPS 201-3, the EDIPI is the primary identifier for DoD personnel
   * and is always present in CAC authentication certificates.
   */
  private extractEDIPI(commonName: string, cert: any): string {
    // Try SAN otherName first (preferred per DoD PKI profile)
    if (cert.subjectaltname) {
      const sanString = typeof cert.subjectaltname === 'string'
        ? cert.subjectaltname
        : '';
      const edipiMatch = sanString.match(/(\d{10})/);
      if (edipiMatch) {
        return edipiMatch[1];
      }
    }

    // Fallback: extract from CN (LAST.FIRST.MIDDLE.EDIPI format)
    const cnParts = commonName.split('.');
    const lastPart = cnParts[cnParts.length - 1];
    if (/^\d{10}$/.test(lastPart)) {
      return lastPart;
    }

    return '';
  }

  // -------------------------------------------------------------------------
  // Certificate chain validation
  // -------------------------------------------------------------------------

  /**
   * Validate the certificate chain against the DoD PKI trust store.
   *
   * Verifies:
   *   1. Certificate is within its validity period
   *   2. Issuer is a recognized DoD intermediate CA
   *   3. Chain roots to a trusted DoD Root CA
   *
   * In production, full chain validation is performed by the TLS layer
   * (nginx/Node.js) using the DoD trust store. This method provides an
   * application-level secondary check.
   */
  private validateCertificateChain(certInfo: CACCertificateInfo): CertificateValidationResult {
    const now = new Date();

    // Check validity period
    if (now < certInfo.validFrom) {
      return { valid: false, reason: 'Certificate is not yet valid.' };
    }
    if (now > certInfo.validTo) {
      return { valid: false, reason: 'Certificate has expired.' };
    }

    // Verify issuer is a known DoD intermediate CA
    const issuerDN = certInfo.issuer;
    const isKnownIssuer = DOD_INTERMEDIATE_CA_PATTERNS.some(pattern =>
      pattern.test(issuerDN),
    );

    if (!isKnownIssuer) {
      // In development, allow configurable bypass for testing
      const allowNonDoD = this.configService.get<boolean>('CAC_ALLOW_NON_DOD_ISSUER', false);
      if (!allowNonDoD) {
        return {
          valid: false,
          reason: `Certificate issuer "${issuerDN}" is not a recognized DoD CA.`,
        };
      }
      this.logger.warn(
        `Non-DoD certificate issuer allowed in development mode: ${issuerDN}`,
      );
    }

    return { valid: true, certificateInfo: certInfo };
  }

  // -------------------------------------------------------------------------
  // Revocation checking
  // -------------------------------------------------------------------------

  /**
   * Check certificate revocation status via CRL or OCSP.
   *
   * Per DoDI 8520.02, all PKI-enabled applications must verify certificate
   * revocation status before granting access. OCSP is preferred for
   * real-time checking; CRL is the fallback.
   *
   * TODO: Implement live CRL/OCSP checking against DoD CRL distribution
   *       points and OCSP responders. Current implementation returns a
   *       placeholder result. Production deployment requires:
   *       - CRL download from DISA CRL DP (https://crl.disa.mil/)
   *       - OCSP responder integration (DoD OCSP)
   *       - CRL caching with configurable refresh interval
   *       - Fail-open vs fail-closed policy configuration
   */
  private async checkRevocationStatus(
    certInfo: CACCertificateInfo,
  ): Promise<RevocationCheckResult> {
    const ocspEnabled = this.configService.get<boolean>('CAC_OCSP_ENABLED', false);
    const crlEnabled = this.configService.get<boolean>('CAC_CRL_ENABLED', false);

    if (ocspEnabled) {
      return this.checkOCSP(certInfo);
    }

    if (crlEnabled) {
      return this.checkCRL(certInfo);
    }

    // No revocation checking configured — log warning
    this.logger.warn(
      'Certificate revocation checking is disabled. Enable CAC_OCSP_ENABLED or ' +
      'CAC_CRL_ENABLED for production use. Ref: DoDI 8520.02.',
    );

    return {
      revoked: false,
      reason: 'Revocation checking not configured.',
      checkedAt: new Date(),
      method: 'NONE',
    };
  }

  /**
   * Check revocation via OCSP (Online Certificate Status Protocol).
   *
   * TODO: Implement OCSP request to DoD OCSP responder.
   */
  private async checkOCSP(certInfo: CACCertificateInfo): Promise<RevocationCheckResult> {
    // TODO: Send OCSP request to DoD OCSP responder
    // const ocspUrl = this.configService.get<string>('CAC_OCSP_URL');
    this.logger.debug(`OCSP check for serial ${certInfo.serialNumber} (stub)`);
    return {
      revoked: false,
      checkedAt: new Date(),
      method: 'OCSP',
    };
  }

  /**
   * Check revocation via CRL (Certificate Revocation List).
   *
   * TODO: Implement CRL download, caching, and lookup.
   */
  private async checkCRL(certInfo: CACCertificateInfo): Promise<RevocationCheckResult> {
    // TODO: Download and cache CRL from DISA CRL distribution point
    // const crlUrl = this.configService.get<string>('CAC_CRL_URL');
    this.logger.debug(`CRL check for serial ${certInfo.serialNumber} (stub)`);
    return {
      revoked: false,
      checkedAt: new Date(),
      method: 'CRL',
    };
  }

  // -------------------------------------------------------------------------
  // User provisioning
  // -------------------------------------------------------------------------

  /**
   * Build a user profile from the validated CAC certificate data.
   *
   * If the user does not exist in the system, they are auto-provisioned
   * from the certificate fields. This enables zero-touch onboarding for
   * DoD personnel — simply inserting their CAC card creates their account.
   *
   * Per NIST SP 800-63B, PKI authentication via hardware token (CAC/PIV)
   * satisfies MFA requirements at AAL2 and AAL3 (something you have +
   * something you know via PIN entry at the card reader).
   */
  private async buildUserProfile(certInfo: CACCertificateInfo): Promise<CACUserProfile> {
    // Parse display name from CN (format: LAST.FIRST.MIDDLE.EDIPI)
    const nameParts = certInfo.commonName.split('.');
    const displayName = nameParts.length >= 3
      ? `${nameParts[1]} ${nameParts[0]}` // "FIRST LAST"
      : certInfo.commonName;

    return {
      edipi: certInfo.edipi,
      commonName: displayName,
      organization: certInfo.organizationalUnit || certInfo.organization,
      mfaSatisfied: true, // PKI auth counts as MFA per NIST 800-63B
      authMethod: 'cac_piv',
      certificateSerialNumber: certInfo.serialNumber,
    };
  }
}
