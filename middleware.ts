import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl;
  // Allow public access to homepage, poll routes, and auth routes
  const isPublicRoute = (
    pathname === '/' ||
    pathname.startsWith('/poll') ||
    pathname.startsWith('/auth')
  );

  if (!session && !isPublicRoute) {
    // Redirect to login if accessing protected route without session
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  if (session && pathname.startsWith('/auth')) {
    // Redirect to dashboard if accessing auth routes with session
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
} 