import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { getCellDetail } from '@/lib/db/moderation'
import { parseCellId } from '@/lib/admin/parseId'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await requireAdmin(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const cellId = parseCellId(id)

  if (cellId === null) {
    return NextResponse.json({ error: 'Invalid cell id.' }, { status: 400 })
  }

  try {
    const detail = await getCellDetail(cellId)

    if (!detail) {
      return NextResponse.json({ error: 'Cell not found.' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (err) {
    console.error('GET /admin/api/cells/[id] failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
