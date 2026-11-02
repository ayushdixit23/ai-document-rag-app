'use client';

import { useState } from 'react';

import { canAttachFiles } from '@/components/chats/composer-attachments';
import { useComposerAttachments } from '@/components/chats/use-composer-attachments';
import { type ComposerSuggestion, useComposerField } from '@/components/chats/use-composer-field';
import type { SendMessageInput } from '@/lib/chats/types';

type DraftOptions = {
  disabled: boolean;
  suggestion?: ComposerSuggestion;
  onSend: (input: SendMessageInput) => Promise<boolean>;
};

export function useComposerDraft({ disabled, suggestion, onSend }: DraftOptions) {
  const [submitting, setSubmitting] = useState(false);
  const attachments = useComposerAttachments(submitting);
  const field = useComposerField({
    disabled,
    hasFiles: attachments.files.length > 0,
    attachmentsReady: canAttachFiles(attachments.files),
    suggestion,
    onSend: async (content) => {
      setSubmitting(true);
      try {
        const documentIds = attachments.files.flatMap((item) =>
          item.document ? [item.document.id] : [],
        );
        const sent = await onSend({ content, documentIds });
        if (sent) attachments.clearFiles();
        return sent;
      } finally {
        setSubmitting(false);
      }
    },
  });
  return { field, attachments, submitting };
}
