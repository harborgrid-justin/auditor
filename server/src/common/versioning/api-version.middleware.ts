/**
 * API Versioning Middleware
 *
 * Provides URI-based API versioning for the DoD financial audit platform.
 * Supports version negotiation via URI path prefix (/api/v1/..., /api/v2/...)
 * and adds deprecation headers for sunset versions.
 *
 * Versioning strategy:
 *   - URI versioning: /api/v{major}/resource
 *   - Current version: v1
 *   - Deprecation headers per IETF Deprecation HTTP Header Field draft
 *   - Sunset header per RFC 8594 for end-of-life versions
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

/** Version descriptor with lifecycle metadata. */
interface ApiVersionInfo {
  /** Major version number */
  version: number;
  /** Whether this version is currently supported */
  supported: boolean;
  /** Whether this version is deprecated (still functional but discouraged) */
  deprecated: boolean;
  /** ISO 8601 date when the version was or will be deprecated */
  deprecatedAt?: string;
  /** ISO 8601 date when the version will be removed (sunset) */
  sunsetDate?: string;
  /** Recommended replacement version */
  successor?: number;
}

// ---------------------------------------------------------------------------
// Version Registry
// ---------------------------------------------------------------------------

/** Current active API version. */
const CURRENT_VERSION = 1;

/**
 * Registered API versions with lifecycle status.
 *
 * When deprecating a version:
 *   1. Set deprecated = true and deprecatedAt to the announcement date
 *   2. Set sunsetDate to the planned removal date (min 6 months notice)
 *   3. Set successor to the replacement version
 *   4. After sunset, set supported = false
 */
const VERSION_REGISTRY: Map<number, ApiVersionInfo> = new Map([
  [
    1,
    {
      version: 1,
      supported: true,
      deprecated: false,
    },
  ],
]);

// ---------------------------------------------------------------------------
// Middleware Implementation
// ---------------------------------------------------------------------------

@Injectable()
export class ApiVersionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiVersionMiddleware.name);

  /**
   * Process incoming requests to extract and validate the API version.
   *
   * Extracts the version from the URI path (/api/v{N}/...), validates it
   * against the version registry, and attaches version metadata to the
   * request. Adds deprecation and sunset headers for deprecated versions.
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const version = this.extractVersion(req.path);

    if (version === null) {
      // No version prefix — pass through (non-versioned routes)
      next();
      return;
    }

    const versionInfo = VERSION_REGISTRY.get(version);

    // Reject unsupported or unknown versions
    if (!versionInfo || !versionInfo.supported) {
      res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: `API version v${version} is not supported. ` +
          `Current version: v${CURRENT_VERSION}.`,
        currentVersion: `v${CURRENT_VERSION}`,
      });
      return;
    }

    // Attach version metadata to the request for downstream use
    (req as any).apiVersion = version;
    (req as any).apiVersionInfo = versionInfo;

    // Add standard version response header
    res.setHeader('X-API-Version', `v${version}`);

    // Add deprecation headers for deprecated-but-supported versions
    if (versionInfo.deprecated) {
      this.addDeprecationHeaders(res, versionInfo);
      this.logger.warn(
        `Deprecated API v${version} accessed: ${req.method} ${req.path}`,
      );
    }

    next();
  }

  /**
   * Extract the API version number from the URI path.
   *
   * Matches paths like /api/v1/..., /api/v2/..., etc.
   * Returns null if no version prefix is found.
   */
  private extractVersion(path: string): number | null {
    const match = path.match(/^\/api\/v(\d+)(\/|$)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Add deprecation and sunset headers per IETF standards.
   *
   * Headers added:
   *   - Deprecation: date when the version was deprecated (IETF draft)
   *   - Sunset: date when the version will be removed (RFC 8594)
   *   - Link: pointer to the successor version or migration docs
   */
  private addDeprecationHeaders(res: Response, info: ApiVersionInfo): void {
    if (info.deprecatedAt) {
      // Deprecation header per IETF draft-ietf-httpapi-deprecation-header
      res.setHeader('Deprecation', info.deprecatedAt);
    }

    if (info.sunsetDate) {
      // Sunset header per RFC 8594
      res.setHeader('Sunset', info.sunsetDate);
    }

    if (info.successor) {
      // Link header pointing to the successor version
      res.setHeader(
        'Link',
        `</api/v${info.successor}>; rel="successor-version"`,
      );
    }
  }
}
