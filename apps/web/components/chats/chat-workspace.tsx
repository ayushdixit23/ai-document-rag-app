'use client';

import { useState } from 'react';

import { ChatHeader } from '@/components/chats/chat-header';
import { ChatLoadBanner } from '@/components/chats/chat-load-state';
import { Composer } from '@/components/chats/composer';
import { EmptyState } from '@/components/chats/empty-state';
import { MessageList } from '@/components/chats/message-list';
import type { ComposerSuggestion } from '@/components/chats/use-composer-field';
import { CHAT_COLUMN } from '@/lib/chats/layout';
import type { Message, SendMessageInput } from '@/lib/chats/types';

type ChatWorkspaceProps = {
  title: string;
  chatId?: string;
  hasMessages: boolean;
  pendingMessages: Message[];
  disabled: boolean;
  loadError?: string;
  onReload: () => void;
  onSend: (input: SendMessageInput) => Promise<boolean>;
  onStop?: () => void;
};

export function ChatWorkspace({
  title,
  chatId,
  hasMessages,
  pendingMessages,
  disabled,
  loadError,
  onReload,
  onSend,
  onStop,
}: ChatWorkspaceProps) {
  const [suggestion, setSuggestion] = useState<ComposerSuggestion>();
  const empty = !hasMessages && pendingMessages.length === 0;
  const suggest = (text: string) => {
    setSuggestion((previous) => ({ text, version: (previous?.version ?? 0) + 1 }));
  };
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {!empty ? <ChatHeader title={title} /> : null}
      {loadError ? <ChatLoadBanner error={loadError} onRetry={onReload} /> : null}
      <div
        className={
          empty
            ? 'flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-8 md:py-12'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        {empty ? (
          <div className={CHAT_COLUMN}>
            <EmptyState onSuggest={suggest} />
          </div>
        ) : (
          <MessageList chatId={chatId} pendingMessages={pendingMessages} />
        )}
        <div className={empty ? 'mt-10 sm:mt-12' : 'relative w-full shrink-0 pb-5 md:pb-6'}>
          {!empty ? (
            <div className="from-background pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-t to-transparent" />
          ) : null}
          <div className={`${CHAT_COLUMN} pt-2`}>
            <Composer
              autoFocus
              disabled={disabled}
              suggestion={suggestion}
              onSend={onSend}
              onStop={onStop}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
