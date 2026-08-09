/**
 * MiMo OS — Approval actions API
 * ------------------------------
 * POST /api/approvals/[id]/approve  — resume the paused task (status → 'executing')
 * POST /api/approvals/[id]/reject   — cancel the paused task (status → 'cancelled')
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action as 'approve' | 'reject' | undefined;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'required: action=approve|reject' },
        { status: 400 },
      );
    }

    const newStatus = action === 'approve' ? 'executing' : 'cancelled';
    const updated = await db.task.update({
      where: { id },
      data: {
        status: newStatus,
        completedAt: action === 'reject' ? new Date() : null,
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.getTime(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
