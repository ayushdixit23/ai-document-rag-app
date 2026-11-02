'use client';

import { useState } from 'react';

import { ComposerFileList } from '@/components/chats/composer-file-list';
import { ComposerFooter } from '@/components/chats/composer-footer';
import { ComposerInput } from '@/components/chats/composer-input';
import { ComposerShell } from '@/components/chats/composer-shell';
import { useComposerDraft } from '@/components/chats/use-composer-draft';
import type { ComposerSuggestion } from '@/components/chats/use-composer-field';
import type { SendMessageInput } from '@/lib/chats/types';

type ComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  suggestion?: ComposerSuggestion;
  onSend: (input: SendMessageInput) => Promise<boolean>;
  onStop?: () => void;
};

export function Composer({
  disabled = false,
  placeholder = 'Ask anything, or attach documents…',
  autoFocus = false,
  suggestion,
  onSend,
  onStop,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const { field, attachments, submitting } = useComposerDraft({ disabled, suggestion, onSend });
  return (
    <ComposerShell
      focused={focused}
      isDragging={attachments.isDragging}
      inputRef={attachments.inputRef}
      onInputChange={attachments.onInputChange}
      onDragEnter={attachments.onDragEnter}
      onDragLeave={attachments.onDragLeave}
      onDragOver={attachments.onDragOver}
      onDrop={attachments.onDrop}
    >
      <ComposerFileList
        files={attachments.files}
        disabled={submitting}
        onRemove={attachments.removeFile}
        onRetry={attachments.retryFile}
      />
      <ComposerInput
        field={field}
        submitting={submitting}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocusChange={setFocused}
      />
      <ComposerFooter
        onStop={onStop}
        valueLength={field.value.length}
        canSend={field.canSend}
        disabled={submitting}
        onAttach={attachments.openPicker}
        onSend={() => {
          void field.submit();
        }}
      />
      {attachments.files.some((item) => item.status === 'uploading') ? (
        <p role="status" className="text-muted-foreground mt-2 text-xs">
          Finish uploading before sending. You can keep typing.
        </p>
      ) : null}
    </ComposerShell>
  );
}
