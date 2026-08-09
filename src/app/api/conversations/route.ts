/**
 * MiMo OS — Conversations API
 * ----------------------------
 * Handles conversation + message persistence.
 * All routes go through Prisma (data layer), not direct DB access from UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/conversations — list conversations with messages
// Supports optional pagination via ?since=<isoTimestamp>&limit=<n>
// Without params, returns all conversations (backward compat) but caps
// messages per conversation at 200 to avoid unbounded payloads.
export async function GET(req: NextRequest) {
  try {
    const sinceParam = req.nextUrl.searchParams.get('since');
    const limitParam = req.nextUrl.searchParams.get('limit');
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 200, 500) : 200;

    const conversations = await db.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      where: since ? { updatedAt: { gt: since } } : undefined,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: limit,
          ...(since ? { where: { createdAt: { gt: since } } } : {}),
        },
      },
    });

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        pinned: c.pinned,
        projectId: c.projectId,
        createdAt: c.createdAt.getTime(),
        updatedAt: c.updatedAt.getTime(),
        messages: c.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          mode: m.mode,
          model: m.model,
          thinking: m.thinking,
          streaming: false, // never load as streaming
          error: m.error,
          time: m.createdAt.getTime(),
        })),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/conversations — create or update a conversation with messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      // Create a new conversation
      const conv = await db.conversation.create({
        data: {
          title: body.title || 'محادثة جديدة',
          pinned: body.pinned ?? false,
          projectId: body.projectId ?? null,
        },
      });
      return NextResponse.json({
        id: conv.id,
        title: conv.title,
        pinned: conv.pinned,
        projectId: conv.projectId,
        createdAt: conv.createdAt.getTime(),
        updatedAt: conv.updatedAt.getTime(),
        messages: [],
      });
    }

    if (action === 'save_message') {
      // Persist a single message to a conversation
      const { conversationId, role, content, mode, model } = body;
      
      // Ensure conversation exists
      let conv = await db.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) {
        conv = await db.conversation.create({
          data: { id: conversationId, title: content.slice(0, 30) + (content.length > 30 ? '…' : '') },
        });
      }

      const msg = await db.message.create({
        data: {
          conversationId,
          role,
          content,
          mode: mode ?? null,
          model: model ?? null,
        },
      });

      // Update conversation title if it's the first message
      if (role === 'user' && conv.title === 'محادثة جديدة') {
        await db.conversation.update({
          where: { id: conversationId },
          data: { title: content.slice(0, 30) + (content.length > 30 ? '…' : '') },
        });
      }

      return NextResponse.json({
        id: msg.id,
        conversationId: msg.conversationId,
        role: msg.role,
        content: msg.content,
        time: msg.createdAt.getTime(),
      });
    }

    if (action === 'delete') {
      const { conversationId } = body;
      await db.message.deleteMany({ where: { conversationId } });
      await db.conversation.delete({ where: { id: conversationId } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
