import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './index';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** DoD-specific roles for fund control and disbursing operations */
export const DOD_ROLES = {
  FINANCIAL_MANAGER: 'financial_manager',
  CERTIFYING_OFFICER: 'certifying_officer',
  FUND_CONTROL_OFFICER: 'fund_control_officer',
  DISBURSING_OFFICER: 'disbursing_officer',
  ADA_INVESTIGATOR: 'ada_investigator',
} as const;

/** Require one of the DoD-specific roles (in addition to base auth) */
export async function requireDoDRole(
  allowedDoDRoles: string[]
): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.user.role === 'admin') return auth;
  if (!allowedDoDRoles.includes(auth.user.role)) {
    return {
      error: NextResponse.json(
        { error: 'Insufficient DoD permissions. Required: ' + allowedDoDRoles.join(', ') },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export type AuthResult =
  | { user: AuthUser; error?: never }
  | { user?: never; error: NextResponse };

/**
 * Verify the request is authenticated and return the user.
 * Returns a NextResponse error if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  const user: AuthUser = {
    id: (session.user as { id: string }).id,
    email: session.user.email || '',
    name: session.user.name || '',
    role: (session.user as { role: string }).role || 'viewer',
  };

  return { user };
}

/**
 * Verify the user has one of the allowed roles.
 */
export async function requireRole(
  allowedRoles: string[]
): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  if (!allowedRoles.includes(auth.user.role)) {
    return {
      error: NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Verify the user is a member of the given engagement.
 */
export async function requireEngagementMember(
  engagementId: string
): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  // Admins can access any engagement
  if (auth.user.role === 'admin') return auth;

  const membership = db
    .select()
    .from(schema.engagementMembers)
    .where(
      and(
        eq(schema.engagementMembers.engagementId, engagementId),
        eq(schema.engagementMembers.userId, auth.user.id)
      )
    )
    .get();

  // Also check if user created the engagement
  const engagement = db
    .select()
    .from(schema.engagements)
    .where(eq(schema.engagements.id, engagementId))
    .get();

  if (!membership && engagement?.createdBy !== auth.user.id) {
    return {
      error: NextResponse.json(
        { error: 'Not a member of this engagement' },
        { status: 403 }
      ),
    };
  }

  return auth;
}
