import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JWT Authentication guard backed by Passport's JWT strategy.
 *
 * All routes are protected by default. Routes decorated with @Public()
 * bypass authentication.
 *
 * Registered globally as APP_GUARD in AppModule so every controller
 * is automatically protected without needing @UseGuards().
 */
@Injectable()
export class AuthGuard extends PassportAuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<T>(err: Error | null, user: T, info: Error | undefined): T {
    if (err || !user) {
      throw err || new UnauthorizedException(
        info?.message || 'Invalid or expired authentication token',
      );
    }
    return user;
  }
}
