'use client';

import { cn } from '@repo/ui/lib/utils';
import { RotateCcw, X } from 'lucide-react';

const ACTION_FOCUS =
  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

type ActionProps = {
  name: string;
  disabled?: boolean;
};

export function RetryButton({ name, disabled, onRetry }: ActionProps & { onRetry: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Retry ${name}`}
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-muted -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        ACTION_FOCUS,
      )}
      onClick={onRetry}
    >
      <RotateCcw className="size-3.5" aria-hidden />
    </button>
  );
}

type RemoveBadgeProps = ActionProps & {
  revealOnHover: boolean;
  onRemove: () => void;
};

export function RemoveBadge({ name, disabled, revealOnHover, onRemove }: RemoveBadgeProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Remove ${name}`}
      className={cn(
        'bg-background text-foreground border-border hover:bg-muted absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-sm transition-[opacity,background-color]',
        'before:absolute before:-inset-3 before:content-[""]',
        ACTION_FOCUS,
        revealOnHover &&
          'opacity-0 group-focus-within/chip:opacity-100 group-hover/chip:opacity-100 pointer-coarse:opacity-100',
      )}
      onClick={onRemove}
    >
      <X className="size-3" aria-hidden />
    </button>
  );
}
