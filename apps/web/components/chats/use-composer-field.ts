'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

const MIN_HEIGHT_PX = 88;
const MAX_HEIGHT_PX = 280;
export const COMPOSER_MAX_CHARS = 32_000;
export type ComposerSuggestion = { text: string; version: number };

type FieldOptions = {
  onSend: (content: string) => Promise<boolean>;
  disabled: boolean;
  hasFiles: boolean;
  attachmentsReady: boolean;
  suggestion?: ComposerSuggestion;
};

export function useComposerField(options: FieldOptions) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend =
    !options.disabled &&
    !submitting &&
    options.attachmentsReady &&
    (value.trim().length > 0 || options.hasFiles) &&
    value.length <= COMPOSER_MAX_CHARS;

  useEffect(() => {
    if (options.suggestion) {
      setValue(options.suggestion.text);
      textareaRef.current?.focus();
    }
  }, [options.suggestion]);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${String(Math.min(Math.max(el.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX))}px`;
  }, [value]);

  const submit = async () => {
    if (!canSend || sending.current) return;
    sending.current = true;
    setSubmitting(true);
    setValue('');
    try {
      if (!(await options.onSend(value.trim()))) setValue(value);
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };
  return { value, setValue, textareaRef, canSend, submit, submitting, onKeyDown };
}
