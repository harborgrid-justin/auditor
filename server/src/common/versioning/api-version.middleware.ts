/**
 * API Versioning Middleware
 *
 * Extracts and validates API version information from incoming requests,
 * supporting both URI-based versioning (/api/v1/..., /api/v2/...) and
 * Accept header content negotiation (application/vnd.auditor.v1+json).
 *
 * Attaches the resolved version to `req.apiVersion` for downstream
 * consumption and adds response headers for version visibility and
 * deprecation signaling.
 *
 * Versioning strategy:
 *   - URI path: /api/v{major}/resource  (primary)
 *   - Accept header: application/vnd.auditor.v{major}+json  (alternative)
 *   - v1 = current stable version
 *   - v2 = planned future version
 *
 * Response headers:
 *   - X-API-Version:    Active version for this response
 *   - X-API-Deprecated: "true" if the requested version is deprecated
 *   - Deprecation:      ISO 8601 date when the version was deprecated
 *   - Sunset:           ISO 8601 date when the version will be removed
 *   - Link:             Pointer to successor version
 *
 * References:
 *   - RFC 8594: The Sunset HTTP Header Field
 *   - IETF draft-ietf-httpapi-deprecation-header: Deprecation HTTP Header
 *   - DoD API Standards: Consistent versioning for interoperability
 */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported API version identifier. */
export type ApiVersion = number;

/** Configuration for a single API version. */
export interface VersionConfig {
  /** Major version number */
  version: ApiVersion;
  /** Whether this version is currently supported and accepting requests */
  supported: boolean;
  /** Whether this version is deprecated (still functional but discouraged) */
  deprecated: boolean;
  /** ISO 8601 date when the version was or will be deprecated */
  deprecatedAt?: string;
  /** ISO 8601 date when the version will be fully removed */
  sunsetDate?: string;
  /** Recommended successor version */
  successor?: ApiVersion;
}

/** Deprecation metadata for response headers. */
export interface DeprecationInfo {
  /** Whether the version is deprecated */
  deprecated: boolean;
  /** ISO 8601 deprecation date */
  deprecatedAt?: string;
  /** ISO 8601 sunset (removal) date */
  sunsetDate?: string;
  /** Successor version, if any */
  successor?: ApiVersion;
  /** Human-readable message */
  message: string;
}

// ---------------------------------------------------------------------------
// Version Registry
// ---------------------------------------------------------------------------

/** Current latest API version. */
const LATEST_VERSION: ApiVersion = 1;

/**
 * Registered API versions with lifecycle metadata.
 *
 * When deprecating a version:
 *   1. Set deprecated = true and deprecatedAt to the announcement date
 *   2. Set sunsetDate to the planned removal date (minimum 6 months notice)
 *   3. Set successor to the replacement version
 *   4. After the sunset date, set supported = false
 */
const VERSION_REGISTRY: Map<ApiVersion, VersionConfig> = new Map([
  [
    1,
    {
      version: 1,
      supported: true,
      deprecated: false,
    },
  ],
  [
    2,
    {
      version: 2,
      supported: false,
      deprecated: false,
    },
  ],
]);

// ---------------------------------------------------------------------------
// Accept Header Pattern
// ---------------------------------------------------------------------------

/**
 * Regex to extract version from the Accept header.
 * Matches: application/vnd.auditor.v{N}+json
 */
const ACCEPT_HEADER_PATTERN = /application\/vnd\.auditor\.v(\d+)\+json/i;

/**
 * Regex to extract version from the URI path.
 * Matches: /api/v{N}/ or /api/v{N} (end of string)
 */
const URI_PATH_PATTERN = /^\/api\/v(\d+)(\/|$)/;

// ---------------------------------------------------------------------------
// Middleware Implementation
// ---------------------------------------------------------------------------

@Injectable()
export class ApiVersionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiVersionMiddleware.name);

  /**
   * Process incoming requests to extract, validate, and attach API version.
   *
   * Resolution order:
   *   1. URI path prefix (/api/v1/...) -- takes precedence
   *   2. Accept header (application/vnd.auditor.v1+json)
   *   3. Default to latest version if no version indicator is present
   *
   * Sets `req.apiVersion` to the resolved version number and adds
   * appropriate response headers.
   */
  use(req: Request, res: Response, next: NextFunction): void {
    // Step 1: Extract version from URI or Accept header
    let version = this.extractVersionFromPath(req.path);

    if (version === null) {
      version = this.extractVersionFromAcceptHeader(req);
    }

    if (version === null) {
      // No version indicator -- pass through for non-versioned routes
      next();
      return;
    }

    // Step 2: Validate the version
    if (!this.isVersionSupported(version)) {
      const config = VERSION_REGISTRY.get(version);
      const isSunset = config && !config.supported && config.sunsetDate;

      res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: isSunset
          ? `API version v${version} has been sunset as of ${config!.sunsetDate}. ` +
            `Please migrate to v${this.getLatestVersion()}.`
          : `API version v${version} is not supported. ` +
            `Current version: v${this.getLatestVersion()}.`,
        currentVersion: `v${this.getLatestVersion()}`,
      });
      return;
    }

    // Step 3: Attach version to the request object
    (req as any).apiVersion = version;

    // Step 4: Add response headers
    res.setHeader('X-API-Version', `v${version}`);

    const versionConfig = VERSION_REGISTRY.get(version);
    if (versionConfig?.deprecated) {
      res.setHeader('X-API-Deprecated', 'true');
      this.addDeprecationHeaders(res, versionConfig);
      this.logger.warn(
        `Deprecated API v${version} accessed: ${req.method} ${req.path}`,
      );
    }

    next();
  }

  // -------------------------------------------------------------------------
  // Version Queries
  // -------------------------------------------------------------------------

  /**
   * Check if a given version is currently supported.
   *
   * A version is supported if it exists in the registry and its
   * `supported` flag is true (regardless of deprecation status).
   *
   * @param version - The version number to check
   * @returns Whether the version is supported
   */
  isVersionSupported(version: ApiVersion): boolean {
    const config = VERSION_REGISTRY.get(version);
    return config?.supported === true;
  }

  /**
   * Return the current latest (recommended) API version.
   *
   * @returns The latest version number
   */
  getLatestVersion(): ApiVersion {
    return LATEST_VERSION;
  }

  /**
   * Return the deprecation date for a given version.
   *
   * @param version - The version number to query
   * @returns Deprecation info or null if the version is not deprecated
   */
  getDeprecationDate(version: ApiVersion): DeprecationInfo | null {
    const config = VERSION_REGISTRY.get(version);

    if (!config) {
      return null;
    }

    if (!config.deprecated) {
      return {
        deprecated: false,
        message: `API v${version} is not deprecated.`,
      };
    }

    return {
      deprecated: true,
      deprecatedAt: config.deprecatedAt,
      sunsetDate: config.sunsetDate,
      successor: config.successor,
      message:
        `API v${version} was deprecated on ${config.deprecatedAt || 'unknown date'}. ` +
        (config.sunsetDate
          ? `It will be removed on ${config.sunsetDate}. `
          : '') +
        (config.successor
          ? `Please migrate to v${config.successor}.`
          : 'No successor version has been announced.'),
    };
  }

  // -------------------------------------------------------------------------
  // Version Extraction
  // -------------------------------------------------------------------------

  /**
   * Extract the API version from the URI path.
   *
   * Matches /api/v1/..., /api/v2/..., etc.
   *
   * @param path - The request path
   * @returns Version number or null
   */
  private extractVersionFromPath(path: string): ApiVersion | null {
    const match = path.match(URI_PATH_PATTERN);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract the API version from the Accept header.
   *
   * Matches: application/vnd.auditor.v{N}+json
   *
   * @param req - The incoming request
   * @returns Version number or null
   */
  private extractVersionFromAcceptHeader(req: Request): ApiVersion | null {
    const accept = req.headers.accept;
    if (!accept) return null;

    const match = accept.match(ACCEPT_HEADER_PATTERN);
    return match ? parseInt(match[1], 10) : null;
  }

  // -------------------------------------------------------------------------
  // Deprecation Headers
  // -------------------------------------------------------------------------

  /**
   * Add deprecation and sunset response headers per IETF standards.
   *
   * Headers:
   *   - Deprecation: ISO 8601 date (IETF draft-ietf-httpapi-deprecation-header)
   *   - Sunset: ISO 8601 date (RFC 8594)
   *   - Link: rel="successor-version" pointing to the new API version
   *
   * @param res - The response object
   * @param config - The version configuration
   */
  private addDeprecationHeaders(res: Response, config: VersionConfig): void {
    if (config.deprecatedAt) {
      res.setHeader('Deprecation', config.deprecatedAt);
    }

    if (config.sunsetDate) {
      res.setHeader('Sunset', config.sunsetDate);
    }

    if (config.successor) {
      res.setHeader(
        'Link',
        `</api/v${config.successor}>; rel="successor-version"`,
      );
    }
  }
}
