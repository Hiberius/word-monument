import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAdminSessionCookieValue, ADMIN_SESSION_COOKIE_NAME } from '@/lib/security/admin-auth'
import { ADMIN_LOGIN_PATH } from '@/lib/admin/constants'

// Guards every page nested under this route group (currently just the
// dashboard at /admin). The login page intentionally lives *outside* this
// group as a plain, unguarded route - see src/app/admin/login/page.tsx for
// why: a server layout has no reliable way to read the current pathname, so
// rather than reach for a pathname-forwarding middleware just to special-
// case "don't redirect if we're already on the login page", the login page
// simply isn't wrapped by this guard at all. Net effect is identical to the
// spec: the whole authenticated /admin surface shares one auth gate, and an
// invalid or missing session sends you to /admin/login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value

  const isValid = sessionCookie ? await verifyAdminSessionCookieValue(sessionCookie) : false

  if (!isValid) {
    redirect(ADMIN_LOGIN_PATH)
  }

  return <>{children}</>
}
