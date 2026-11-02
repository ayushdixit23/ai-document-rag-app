'use client';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { ArrowUp, Paperclip, Square } from 'lucide-react';

import { COMPOSER_MAX_CHARS } from '@/components/chats/use-composer-field';

type ComposerFooterProps = {
  valueLength: number;
  canSend: boolean;
  disabled?: boolean;
  onAttach: () => void;
  onSend: () => void;
  onStop?: () => void;
};

export function ComposerFooter({
  valueLength,
  canSend,
  disabled = false,
  onAttach,
  onSend,
  onStop,
}: ComposerFooterProps) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={disabled}
        aria-label="Add attachment"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-11 items-center gap-1.5 rounded-lg px-1.5 text-[12px] transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 sm:h-8"
        onClick={onAttach}
      >
        <Paperclip className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Attach files</span>
      </button>
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground/80 text-[11px] tabular-nums">
          {valueLength}/{COMPOSER_MAX_CHARS}
        </span>
        <Button
          type="button"
          size="icon"
          aria-label={onStop ? 'Stop response' : 'Send message'}
          disabled={!onStop && !canSend}
          className={cn(
            'size-11 rounded-lg transition-colors sm:size-8',
            onStop || canSend
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border-border text-muted-foreground border bg-transparent',
          )}
          onClick={onStop ?? onSend}
        >
          {onStop ? (
            <Square className="size-3.5 fill-current" aria-hidden />
          ) : (
            <ArrowUp className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
