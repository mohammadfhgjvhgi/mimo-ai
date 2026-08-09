/**
 * MiMo OS — Conversation (the permanent spine)
 * ------------------------------------------------
 * The conversation fills the viewport. It is the primary surface.
 * No tabs, no top bar, no chrome. Just the conversation + composer.
 *
 * When no conversation is active, shows a calm empty state (not a dashboard).
 *
 * Uses the existing ChatView (which handles messages + streaming).
 */
'use client';

import ChatView from '@/components/nova/ChatView';

export default function Conversation() {
  return <ChatView />;
}
