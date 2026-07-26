import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { dismissReport } from '@/lib/db/moderation'
import { parsePositiveIntId } from '@/lib/admin/parseId'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await requireAdmin(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const reportId = parsePositiveIntId(id)

  if (reportId === null) {
    return NextResponse.json({ error: 'Invalid report id.' }, { status: 400 })
  }

  try {
    await dismissReport(reportId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /admin/api/reports/[id]/dismiss failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
