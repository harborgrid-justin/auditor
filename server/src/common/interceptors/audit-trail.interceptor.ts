import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Intercepts mutating requests (POST, PUT, PATCH, DELETE) and logs
 * audit trail entries for compliance. This mirrors the existing
 * logAuditEvent() pattern from src/lib/audit/logger.ts but in NestJS.
 */
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.mutatingMethods.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // Audit trail logging will be wired to the database module
          // once PostgreSQL migration is complete. For now, structured
          // log output is sufficient.
          const auditEntry = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path: request.url,
            userId: (request as Record<string, unknown>).user
              ? ((request as Record<string, unknown>).user as Record<string, unknown>).id
              : 'anonymous',
            ip: request.ip,
            correlationId: (request as Record<string, unknown>)['correlationId'],
          };

          // Will be replaced with database insert once DatabaseModule is wired
          console.log('[AUDIT]', JSON.stringify(auditEntry));
        },
      }),
    );
  }
}
