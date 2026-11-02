'use client';

import { type RefObject, useEffect, useRef } from 'react';

import { COMPOSER_MAX_CHARS, type useComposerField } from '@/components/chats/use-composer-field';

type ComposerInputProps = {
  field: ReturnType<typeof useComposerField>;
  submitting: boolean;
  placeholder: string;
  autoFocus: boolean;
  onFocusChange: (focused: boolean) => void;
};

function useComposerFocus(
  ref: RefObject<HTMLTextAreaElement | null>,
  autoFocus: boolean,
  submitting: boolean,
) {
  const wasSubmitting = useRef(false);
  useEffect(() => {
    const recovering = wasSubmitting.current && !submitting;
    if (
      autoFocus &&
      !submitting &&
      window.matchMedia('(pointer: fine)').matches &&
      (!recovering || document.activeElement === document.body)
    ) {
      ref.current?.focus({ preventScroll: true });
    }
    wasSubmitting.current = submitting;
  }, [autoFocus, submitting, ref]);
}

export function ComposerInput({
  field,
  submitting,
  placeholder,
  autoFocus,
  onFocusChange,
}: ComposerInputProps) {
  const textareaRef = field.textareaRef;
  useComposerFocus(textareaRef, autoFocus, submitting);
  return (
    <textarea
      ref={field.textareaRef}
      value={field.value}
      disabled={submitting}
      placeholder={placeholder}
      rows={3}
      maxLength={COMPOSER_MAX_CHARS}
      aria-label="Message"
      name="message"
      autoComplete="off"
      className="text-foreground placeholder:text-muted-foreground max-h-70 min-h-22 w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-60"
      onFocus={() => {
        onFocusChange(true);
      }}
      onBlur={() => {
        onFocusChange(false);
      }}
      onChange={(event) => {
        field.setValue(event.target.value);
      }}
      onKeyDown={field.onKeyDown}
    />
  );
}
