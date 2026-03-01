import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const correlationId = uuidv4();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Attach correlation ID to request for downstream use
    (request as Record<string, unknown>)['correlationId'] = correlationId;

    this.logger.log(
      JSON.stringify({
        correlationId,
        type: 'request',
        method,
        url,
        ip,
        userAgent: userAgent.substring(0, 100),
      }),
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const duration = Date.now() - startTime;
          this.logger.log(
            JSON.stringify({
              correlationId,
              type: 'response',
              method,
              url,
              statusCode: response.statusCode,
              duration: `${duration}ms`,
            }),
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            JSON.stringify({
              correlationId,
              type: 'error',
              method,
              url,
              error: error.message,
              duration: `${duration}ms`,
            }),
          );
        },
      }),
    );
  }
}
