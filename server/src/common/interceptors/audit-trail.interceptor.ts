import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { Pool } from 'pg';
import { PG_POOL_TOKEN } from '../../database/database.module';

/** User payload attached to request by auth guard. */
interface RequestUser {
  id: string;
  name?: string;
  email?: string;
}

/**
 * Intercepts mutating requests (POST, PUT, PATCH, DELETE) and persists
 * immutable audit trail entries in the audit_logs table for compliance.
 *
 * References:
 *   - NIST SP 800-53 AU-3: Content of Audit Records
 *   - DoD FMR Vol 1, Ch 3: Internal Controls
 *   - GAO Yellow Book: Audit Documentation Standards
 */
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditTrailInterceptor.name);
  private readonly mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  private static readonly METHOD_TO_ACTION: Record<string, string> = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };

  constructor(
    @Inject(PG_POOL_TOKEN) private readonly pool: Pool,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.mutatingMethods.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const user = (request as unknown as { user?: RequestUser }).user;
          const userId = user?.id ?? 'anonymous';
          const userName = user?.name ?? user?.email ?? 'anonymous';
          const action = AuditTrailInterceptor.METHOD_TO_ACTION[request.method] ?? 'unknown';
          const correlationId = (request as unknown as { correlationId?: string }).correlationId;

          // Extract entity type and id from URL path
          const { entityType, entityId, engagementId } = this.parseRoute(request.url);

          this.persistAuditEntry({
            engagementId,
            userId,
            userName,
            action,
            entityType,
            entityId,
            details: {
              method: request.method,
              path: request.url,
              correlationId,
            },
            ipAddress: request.ip ?? null,
          }).catch((err: unknown) => {
            this.logger.error(
              `Failed to persist audit trail entry: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
      }),
    );
  }

  /**
   * Persist an immutable audit log entry to PostgreSQL.
   * Uses a direct pool query to avoid circular dependencies with Drizzle.
   */
  private async persistAuditEntry(entry: {
    engagementId: string | null;
    userId: string;
    userName: string;
    action: string;
    entityType: string;
    entityId: string | null;
    details: Record<string, unknown>;
    ipAddress: string | null;
  }): Promise<void> {
    const query = `
      INSERT INTO audit_logs (
        id, engagement_id, user_id, user_name, action,
        entity_type, entity_id, details, ip_address, timestamp
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::inet, NOW()
      )
    `;
    const values = [
      entry.engagementId,
      entry.userId,
      entry.userName,
      entry.action,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.details),
      entry.ipAddress,
    ];

    await this.pool.query(query, values);
  }

  /**
   * Parse REST route to extract entity type and IDs.
   * Examples:
   *   /dod/contracts/abc-123       -> { entityType: 'contracts', entityId: 'abc-123' }
   *   /dod/ada/validate            -> { entityType: 'ada', entityId: null }
   *   /engagements/xyz/findings    -> { entityType: 'findings', engagementId: 'xyz' }
   */
  private parseRoute(url: string): {
    entityType: string;
    entityId: string | null;
    engagementId: string | null;
  } {
    const path = url.split('?')[0];
    const segments = path.split('/').filter(Boolean);

    // Remove 'api' prefix if present
    if (segments[0] === 'api') segments.shift();

    let entityType = segments[segments.length - 1] ?? 'unknown';
    let entityId: string | null = null;
    let engagementId: string | null = null;

    // Check for UUID-like segments to identify IDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = 0; i < segments.length; i++) {
      if (uuidPattern.test(segments[i])) {
        // If previous segment is 'engagements', this is the engagement ID
        if (i > 0 && segments[i - 1] === 'engagements') {
          engagementId = segments[i];
        } else {
          entityId = segments[i];
          // Entity type is the segment before the ID
          if (i > 0) {
            entityType = segments[i - 1];
          }
        }
      }
    }

    // If last segment is not a UUID, it's the entity type
    if (!uuidPattern.test(segments[segments.length - 1])) {
      entityType = segments[segments.length - 1] ?? 'unknown';
    }

    return { entityType, entityId, engagementId };
  }
}
