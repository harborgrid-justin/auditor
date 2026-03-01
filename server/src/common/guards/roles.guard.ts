import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Role-Based Access Control guard.
 *
 * Base roles: admin, auditor, reviewer, viewer
 * DoD roles: certifying_officer, fund_control_officer, disbursing_officer,
 *            ada_investigator, comptroller, financial_manager
 *
 * Mirrors the existing requireRole() and requireDoDRole() guards
 * from src/lib/auth/guard.ts but as a NestJS CanActivate guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admin role has access to everything
    if (user.role === 'admin') {
      return true;
    }

    const hasRole = requiredRoles.some(
      (role) => user.role === role || (user.dodRole && user.dodRole === role),
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
