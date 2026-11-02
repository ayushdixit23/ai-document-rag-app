'use client';

import { Button } from '@repo/ui/components/button';
import { ArrowDown } from 'lucide-react';

import { MessageItem } from '@/components/chats/message-item';
import { OlderMessagesControl } from '@/components/chats/older-messages-control';
import { useChatScroll } from '@/components/chats/use-chat-scroll';
import { useOlderMessages } from '@/components/chats/use-older-messages';
import { CHAT_COLUMN } from '@/lib/chats/layout';
import { useChatStore } from '@/lib/chats/store';
import type { Message } from '@/lib/chats/types';

const EMPTY_MESSAGES: Message[] = [];

type MessageListProps = { chatId?: string; pendingMessages: Message[] };

function latestUserId(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.clientId ?? message.id;
  }
}

export function MessageList({ chatId, pendingMessages }: MessageListProps) {
  const savedMessages = useChatStore((state) =>
    chatId ? (state.messagesByChatId[chatId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );
  const messages = chatId ? savedMessages : pendingMessages;
  const page = useChatStore((state) => (chatId ? state.paginationByChatId[chatId] : undefined));
  const scroll = useChatScroll(latestUserId(messages), page?.loading);
  const older = useOlderMessages({
    chatId,
    page,
    following: scroll.following,
    scroller: scroll.scroller,
    prepareForPrepend: scroll.prepareForPrepend,
  });
  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div
        ref={scroll.scroller}
        tabIndex={0}
        role="region"
        aria-label="Conversation"
        className="focus-visible:ring-ring min-h-0 w-full flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:ring-2 focus-visible:outline-none"
      >
        <div
          ref={scroll.content}
          className={`${CHAT_COLUMN} flex flex-col gap-7 pt-6 pb-12 md:gap-8 md:pt-8`}
        >
          {page?.hasMore ? (
            <div ref={older.sentinel}>
              <OlderMessagesControl page={page} onLoad={older.load} />
            </div>
          ) : null}
          {messages.map((message) => (
            <MessageItem key={message.clientId ?? message.id} message={message} />
          ))}
        </div>
      </div>
      {!scroll.following ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-card absolute bottom-3 left-1/2 -translate-x-1/2 gap-2 rounded-lg shadow-soft"
          onClick={scroll.jumpToLatest}
        >
          <ArrowDown className="size-3.5" aria-hidden />
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}
