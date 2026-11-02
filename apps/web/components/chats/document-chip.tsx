'use client';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { Check, CircleAlert, FileText, Loader2, RotateCcw, X } from 'lucide-react';

import { formatFileSize } from '@/lib/documents/format';
import type { DocumentStatus } from '@/lib/documents/types';

const STATUS = {
  uploading: { label: 'Uploading…', icon: Loader2, busy: true },
  pending: { label: 'Queued…', icon: Loader2, busy: true },
  processing: { label: 'Processing…', icon: Loader2, busy: true },
  ready: { label: 'Ready', icon: Check, busy: false },
  failed: { label: 'Failed', icon: CircleAlert, busy: false },
} satisfies Record<DocumentStatus, { label: string; icon: typeof Check; busy: boolean }>;

type DocumentChipProps = {
  name: string;
  size: number;
  status: DocumentStatus;
  error?: string;
  disabled?: boolean;
  onRetry?: () => void;
  onRemove?: () => void;
};

export function DocumentChip({
  name,
  size,
  status,
  error,
  disabled,
  onRetry,
  onRemove,
}: DocumentChipProps) {
  const { label, icon: Icon, busy } = STATUS[status];
  return (
    <div
      className={cn(
        'border-border bg-card text-foreground max-w-full rounded-lg border px-3 py-2 text-xs',
        status === 'failed' && 'border-destructive/40',
      )}
    >
      <div className="flex items-center gap-2">
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block max-w-52 truncate font-medium" title={name}>
            {name}
          </span>
          <span role="status" className="text-muted-foreground mt-1 flex items-center gap-1">
            <Icon
              className={cn('size-3', busy && 'animate-spin motion-reduce:animate-none')}
              aria-hidden
            />
            {label}
            <span aria-hidden> · </span>
            {formatFileSize(size)}
          </span>
        </span>
        <DocumentChipActions
          name={name}
          status={status}
          error={error}
          disabled={disabled}
          onRetry={onRetry}
          onRemove={onRemove}
        />
      </div>
      {error ? (
        <p className="text-destructive mt-2 max-w-72 text-xs wrap-anywhere" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DocumentChipActions({
  name,
  status,
  error,
  disabled,
  onRetry,
  onRemove,
}: Omit<DocumentChipProps, 'size'>) {
  return (
    <>
      {(status === 'failed' || error) && onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-11 shrink-0 sm:size-6"
          disabled={disabled}
          aria-label={`Retry ${name}`}
          onClick={onRetry}
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </Button>
      ) : null}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-11 shrink-0 sm:size-6"
          disabled={disabled}
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </>
  );
}
