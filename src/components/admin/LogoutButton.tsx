'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/admin/session', { method: 'DELETE' })
    } finally {
      router.push('/admin/login')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 disabled:opacity-50"
    >
      {loggingOut ? 'Logging out…' : 'Log out'}
    </button>
  )
}
