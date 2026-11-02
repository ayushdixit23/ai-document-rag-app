'use client';

import { Button } from '@repo/ui/components/button';
import { useEffect } from 'react';

import { ChatListEmpty } from '@/components/chats/chat-list-empty';
import { ChatRow } from '@/components/chats/chat-row';
import { useChatStore } from '@/lib/chats/store';

export function ChatList({ onNavigate }: { onNavigate?: () => void }) {
  const chats = useChatStore((state) => state.chats);
  const status = useChatStore((state) => state.chatList);
  const loadChats = useChatStore((state) => state.loadChats);
  useEffect(() => {
    void loadChats();
  }, [loadChats]);
  if (!chats.length && (status.status === 'idle' || status.status === 'loading')) {
    return (
      <div role="status" className="flex-1 space-y-2 px-5 py-3">
        <span className="sr-only">Loading chats…</span>
        {[1, 2, 3].map((id) => (
          <div
            key={id}
            className="bg-muted h-8 animate-pulse rounded-lg motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }
  return (
    <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
      {status.status === 'error' ? (
        <div role="status" className="px-2 py-3">
          <p className="text-muted-foreground text-xs">{status.error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void loadChats();
            }}
          >
            Retry chats
          </Button>
        </div>
      ) : null}
      {!chats.length && status.status === 'ready' ? <ChatListEmpty /> : null}
      <div className="flex flex-col gap-1">
        {chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
