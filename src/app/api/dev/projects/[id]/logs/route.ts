/**
 * MiMo OS — Dev Project Logs API
 * --------------------------------
 * GET /api/dev/projects/:id/logs?channel=...&level=...&since=...&limit=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryDevLogs, getLogChannels } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const sp = req.nextUrl.searchParams;
    if (sp.get('channels') === 'true') {
      const channels = await getLogChannels(id);
      return NextResponse.json({ channels });
    }
    const channel = sp.get('channel') ?? undefined;
    const level = sp.get('level') ?? undefined;
    const sinceStr = sp.get('since');
    const since = sinceStr ? parseInt(sinceStr, 10) : undefined;
    const limitStr = sp.get('limit');
    const limit = limitStr ? Math.max(1, Math.min(parseInt(limitStr, 10) || 100, 500)) : 100;

    const logs = await queryDevLogs(id, { channel, level, since, limit });
    return NextResponse.json({ logs });
  } catch (err) {
    return handleSandboxError(err);
  }
}
