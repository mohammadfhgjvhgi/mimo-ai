/**
 * MiMo OS — /api/search
 * ----------------------
 * Web search API route. Routes through the Core SearchProvider.
 * Does NOT import z-ai-web-dev-sdk directly (Phase 8 isolation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSearchProvider } from '@/core/search/SearchProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SearchRequestBody {
  query: string;
  num?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequestBody;
    const { query, num = 6 } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 });
    }

    const provider = getSearchProvider();
    const results = await provider.search(query, num);

    return NextResponse.json({
      success: true,
      query,
      results: [...results],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
