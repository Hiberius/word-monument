import StatsPanel from '@/components/admin/StatsPanel'
import ModerationQueue from '@/components/admin/ModerationQueue'
import HeroVariantsPanel from '@/components/admin/HeroVariantsPanel'
import LogoutButton from '@/components/admin/LogoutButton'

export const metadata = {
  title: 'Admin - Word Monument',
  robots: { index: false, follow: false },
}

// Tabular, utilitarian layout is intentional here: this is the one internal
// tool in an otherwise public-facing product, and every child component
// fetches its own data client-side from the /admin/api/* routes.
export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Moderation console</h1>
            <p className="text-sm text-gray-500">Grid health, flagged content, and hero copy performance.</p>
          </div>
          <LogoutButton />
        </header>

        <StatsPanel />
        <HeroVariantsPanel />
        <ModerationQueue />
      </div>
    </main>
  )
}
