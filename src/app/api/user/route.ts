import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/user — get default user profile
 */
export async function GET() {
  const user = await ensureDefaultUser()
  const full = await db.user.findUnique({
    where: { id: user.id },
    include: { preferences: true, apiKeys: { select: { id: true, provider: true, keyAlias: true, isActive: true } } },
  })
  return NextResponse.json({ user: full })
}

/**
 * PATCH /api/user — update profile
 */
export async function PATCH(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.bio !== undefined && { bio: body.bio }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.occupation !== undefined && { occupation: body.occupation }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
      ...(body.language !== undefined && { language: body.language }),
      ...(body.avatar !== undefined && { avatar: body.avatar }),
    },
  })

  return NextResponse.json({ user: updated })
}
