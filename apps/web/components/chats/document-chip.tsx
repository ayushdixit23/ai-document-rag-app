'use client';

import { cn } from '@repo/ui/lib/utils';
import { CircleAlert, FileText, Loader2 } from 'lucide-react';

import { RemoveBadge, RetryButton } from '@/components/chats/document-chip-actions';
import { fileTypeLabel, formatFileSize } from '@/lib/documents/format';
import type { DocumentStatus } from '@/lib/documents/types';

const STATUS_LABEL: Record<DocumentStatus, string | null> = {
  uploading: 'Uploading…',
  pending: 'Queued…',
  processing: 'Processing…',
  ready: null,
  failed: 'Failed',
};

const BUSY: ReadonlySet<DocumentStatus> = new Set(['uploading', 'pending', 'processing']);

type DocumentChipProps = {
  name: string;
  size: number;
  status: DocumentStatus;
  error?: string;
  disabled?: boolean;
  /** Show the remove badge only on hover/focus (sent messages); always visible when false. */
  revealRemoveOnHover?: boolean;
  onRetry?: () => void;
  onRemove?: () => void;
};

function ChipIcon({ status }: { status: DocumentStatus }) {
  if (BUSY.has(status)) {
    return <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />;
  }
  if (status === 'failed') return <CircleAlert className="text-destructive size-4" aria-hidden />;
  return <FileText className="size-4" aria-hidden />;
}

export function DocumentChip({
  name,
  size,
  status,
  error,
  disabled,
  revealRemoveOnHover = false,
  onRetry,
  onRemove,
}: DocumentChipProps) {
  const detail = [STATUS_LABEL[status] ?? fileTypeLabel(name), formatFileSize(size)].join(' · ');
  const canRetry = (status === 'failed' || Boolean(error)) && onRetry;
  return (
    <div className="group/chip relative w-60 max-w-full">
      <div
        className={cn(
          'border-border/70 bg-card flex items-center gap-3 rounded-xl border p-2.5',
          status === 'failed' && 'border-destructive/40',
        )}
      >
        <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
          <ChipIcon status={status} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="text-foreground block truncate text-[13px] leading-tight font-medium"
            title={name}
          >
            {name}
          </span>
          <span role="status" className="text-muted-foreground mt-0.5 block truncate text-xs">
            {detail}
          </span>
        </span>
        {canRetry ? <RetryButton name={name} disabled={disabled} onRetry={onRetry} /> : null}
      </div>
      {onRemove ? (
        <RemoveBadge
          name={name}
          disabled={disabled}
          revealOnHover={revealRemoveOnHover}
          onRemove={onRemove}
        />
      ) : null}
      {error ? (
        <p className="text-destructive mt-1.5 text-xs wrap-anywhere" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
