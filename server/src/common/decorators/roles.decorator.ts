import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route.
 * Supports both base roles and DoD-specific roles.
 *
 * @example
 * @Roles('admin', 'certifying_officer')
 * @Get('disbursements')
 * getDisbursements() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
