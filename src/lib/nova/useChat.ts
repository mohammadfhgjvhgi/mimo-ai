/**
 * MiMo OS — useChat hook (SSE streaming + Action Trace)
 * ------------------------------------------------------
 * Client-side orchestrator for sending messages and streaming replies.
 *
 * v3: Full SSE support — receives action_trace, plan, token, done events.
 *     Shows real-time Action Trace to the user as MiMo thinks.
 *     Persists every message to the database.
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useNova } from '@/lib/nova/store';
import { streamChat, type ActionTraceEvent, type PlanEvent, type ContextRecallEvent } from '@/lib/nova/api';

const uid = (p: string) => p + Date.now() + Math.floor(Math.random() * 1000);

/** Persist a message to the database. */
async function persistMessage(
  conversationId: string,
  role: 'user' | 'ai',
  content: string,
  mode?: string,
  model?: string,
) {
  try {
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'save_message',
        conversationId,
        role,
        content,
        mode,
        model,
      }),
    });
  } catch {
    // Non-blocking — persistence failure doesn't crash the UI
  }
}

/** Load conversations from the database on mount. */
export function useLoadConversations() {
  const { convs, setConvsFromDb } = useNova();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.conversations?.length) return;
        setConvsFromDb(data.conversations);
      } catch {
        // ignore — fallback to seeded conversation
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setConvsFromDb]);
}

export function useChat() {
  const store = useNova();
  const abortRef = useRef(false);

  useEffect(
    () => () => {
      abortRef.current = true;
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current = true;
    store.setLoading(false);
    store.toast('تم الإيقاف');
  }, [store]);

  const send = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? store.input).trim();
      if (!trimmed || store.loading) return;

      const convId = store.activeId;

      // 1. Push the user message (optimistic).
      const userMsgId = uid('m');
      store.updateConv(convId, (c) => ({
        ...c,
        title:
          c.messages.length === 0
            ? trimmed.slice(0, 30) + (trimmed.length > 30 ? '…' : '')
            : c.title,
        messages: [
          ...c.messages,
          {
            id: userMsgId,
            role: 'user' as const,
            content: trimmed,
            time: Date.now(),
          },
        ],
      }));
      store.setInput('');
      store.setLoading(true);
      store.setArtifact(null);
      store.setPanelOpen(false);
      store.setView('chat');
      abortRef.current = false;

      // 2. Persist user message to DB (non-blocking).
      persistMessage(convId, 'user', trimmed, store.mode);

      // 3. Push a placeholder AI message (streaming).
      const aiId = uid('m');
      store.updateConv(convId, (c) => ({
        ...c,
        messages: [
          ...c.messages,
          {
            id: aiId,
            role: 'ai',
            content: '',
            time: Date.now(),
            streaming: true,
          },
        ],
      }));

      // 4. Gather the message list to send.
      const conv = useNova.getState().convs.find((c) => c.id === convId);
      const requestMessages = (conv?.messages ?? []).filter(
        (m) => m.id !== aiId,
      );

      // 5. Stream the validated response from the Core pipeline.
      //    Full SSE: action_trace + plan + token events.
      let fullResponse = '';
      try {
        fullResponse = await streamChat(
          {
            messages: requestMessages,
            model: store.model,
            mode: store.mode,
            deepThink: store.deepThink,
            webSearch: store.webSearch,
            conversationId: convId,
          },
          {
            onChunk: (delta) => {
              if (abortRef.current) return;
              store.updateConv(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === aiId ? { ...m, content: m.content + delta } : m,
                ),
              }));
            },
            onActionTrace: (event: ActionTraceEvent) => {
              if (abortRef.current) return;
              // Store action trace on the AI message for display
              store.updateConv(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== aiId) return m;
                  const traces = m.actionTraces ?? [];
                  // If the last trace has the same stage and is 'working', update it
                  const lastTrace = traces[traces.length - 1];
                  if (lastTrace && lastTrace.stage === event.stage && lastTrace.status === 'working') {
                    return {
                      ...m,
                      actionTraces: [...traces.slice(0, -1), event],
                    };
                  }
                  return {
                    ...m,
                    actionTraces: [...traces, event],
                  };
                }),
              }));
            },
            onPlan: (event: PlanEvent) => {
              if (abortRef.current) return;
              store.updateConv(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === aiId
                    ? {
                        ...m,
                        plan: {
                          intent: event.intent,
                          steps: event.steps,
                          complexity: event.complexity,
                          stepDescriptions: event.stepDescriptions,
                        },
                      }
                    : m,
                ),
              }));
            },
            onContextRecall: (event: ContextRecallEvent) => {
              if (abortRef.current) return;
              store.updateConv(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === aiId
                    ? {
                        ...m,
                        recalledMemories: event.memories,
                        recalledEntities: event.entities,
                      }
                    : m,
                ),
              }));
            },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'فشل الاتصال';
        store.updateConv(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === aiId
              ? { ...m, content: m.content || '', error: msg, streaming: false }
              : m,
          ),
        }));
        store.toast('⚠️ تعذّر الاتصال بالـ AI');
      }

      // 6. Finalise — mark as not streaming.
      store.updateConv(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === aiId ? { ...m, streaming: false } : m,
        ),
      }));

      // 7. Persist AI message to DB (non-blocking).
      if (fullResponse) {
        persistMessage(convId, 'ai', fullResponse, store.mode, String(store.model));
      }

      store.setLoading(false);
    },
    [store],
  );

  return { send, stop };
}
