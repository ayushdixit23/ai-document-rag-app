'use client';

import { useEffect } from 'react';

import { ChatLoadState } from '@/components/chats/chat-load-state';
import { ChatWorkspace } from '@/components/chats/chat-workspace';
import { useChatSend } from '@/components/chats/use-chat-send';
import { useChatStore } from '@/lib/chats/store';

export function ChatPanel({ chatId }: { chatId?: string }) {
  return <ChatPanelContent key={chatId ?? 'new'} chatId={chatId} />;
}

function ChatPanelContent({ chatId }: { chatId?: string }) {
  const { activeId, pendingMessages, disabled, onSend, onStop } = useChatSend(chatId);
  const loadThread = useChatStore((state) => state.loadThread);
  const thread = useChatStore((state) => (activeId ? state.threads[activeId] : undefined));
  const title = useChatStore(
    (state) => state.chats.find((chat) => chat.id === activeId)?.title ?? 'New chat',
  );
  const hasMessages = useChatStore((state) =>
    Boolean(activeId && state.messagesByChatId[activeId]?.length),
  );
  useEffect(() => {
    if (activeId) void loadThread(activeId);
  }, [activeId, loadThread]);
  const reload = () => {
    if (activeId) void loadThread(activeId);
  };
  if (activeId && (!thread || thread.notFound || (!hasMessages && thread.status !== 'ready'))) {
    return <ChatLoadState state={thread} onRetry={reload} />;
  }
  return (
    <ChatWorkspace
      title={title}
      chatId={activeId}
      hasMessages={hasMessages}
      pendingMessages={pendingMessages}
      disabled={disabled}
      onSend={onSend}
      onStop={onStop}
      onReload={reload}
      loadError={thread?.status === 'error' ? thread.error : undefined}
    />
  );
}
