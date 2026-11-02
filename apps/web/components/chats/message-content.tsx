'use client';

import { memo } from 'react';
import { Streamdown } from 'streamdown';

import { MarkdownCitations } from '@/components/chats/markdown-citations';
import { markdownComponents } from '@/components/chats/markdown-components';
import { markdownOptions } from '@/lib/chats/markdown-options';
import type { Citation } from '@/lib/chats/types';

export const MessageContent = memo(function MessageContent({
  content,
  citations,
  pending,
}: {
  content: string;
  citations: Citation[];
  pending: boolean;
}) {
  return (
    <MarkdownCitations citations={citations} pending={pending}>
      <Streamdown
        {...markdownOptions}
        className="answer-markdown"
        components={markdownComponents}
        isAnimating={pending}
        parseIncompleteMarkdown={pending}
      >
        {content}
      </Streamdown>
    </MarkdownCitations>
  );
});
