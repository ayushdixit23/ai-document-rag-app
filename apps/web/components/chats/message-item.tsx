'use client';

import { memo } from 'react';

import { CitationChips } from '@/components/chats/citation-chips';
import { MessageContent } from '@/components/chats/message-content';
import { MessageDocuments } from '@/components/chats/message-documents';
import { MessageRetry } from '@/components/chats/message-retry';
import { TypingIndicator } from '@/components/chats/typing-indicator';
import type { Message } from '@/lib/chats/types';

export const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <article
        className="chat-fade-in flex w-full flex-col items-end gap-2"
        aria-label="Your message"
        data-message-id={message.clientId ?? message.id}
      >
        <MessageDocuments documentIds={message.documentIds} />
        {message.content ? (
          <div className="bg-secondary/80 text-foreground min-w-0 max-w-[90%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[85%]">
            <p className="whitespace-pre-wrap wrap-anywhere">{message.content}</p>
          </div>
        ) : null}
      </article>
    );
  }
  const streaming = message.status === 'streaming';
  return (
    <article
      className="chat-fade-in w-full"
      aria-label="AskDocs answer"
      aria-busy={streaming}
      data-message-id={message.clientId ?? message.id}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="bg-foreground text-background flex size-5 items-center justify-center rounded-sm text-[10px] font-bold"
        >
          A
        </span>
        <span className="text-muted-foreground text-xs font-medium tracking-wide">AskDocs</span>
      </div>
      <div className="text-foreground text-base leading-relaxed">
        {streaming && !message.content ? (
          <TypingIndicator readingDocuments={message.phase === 'reading_documents'} />
        ) : (
          <MessageContent
            content={message.content ?? ''}
            citations={message.sourceCandidates ?? message.citations}
            pending={streaming}
          />
        )}
        <CitationChips citations={message.citations} />
        {message.status === 'error' || message.status === 'stopped' ? (
          <MessageRetry message={message} />
        ) : null}
      </div>
    </article>
  );
});
