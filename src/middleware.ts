import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/api/analyze/:path*',
    '/api/engagements/:path*',
    '/api/export/:path*',
    '/api/findings/:path*',
    '/api/upload/:path*',
    '/api/audit-log/:path*',
    '/api/workpapers/:path*',
    '/api/signoffs/:path*',
    '/api/templates/:path*',
    '/api/schedules/:path*',
    '/api/portal/:path*',
  ],
};
