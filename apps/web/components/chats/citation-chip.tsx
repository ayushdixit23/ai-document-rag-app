'use client';

import { Button } from '@repo/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/tooltip';
import { useState } from 'react';

import type { Citation } from '@/lib/chats/types';

export function CitationChip({
  citation,
  inline,
  pending,
}: {
  citation: Citation;
  inline?: boolean;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const title = `${citation.title}${citation.page ? ` · page ${String(citation.page)}` : ''}`;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Source ${String(citation.n)}: ${title}`}
            onClick={() => {
              setOpen(true);
            }}
            className={
              inline
                ? 'text-primary mx-0.5 inline-flex h-6 rounded-sm px-1.5 align-baseline text-xs'
                : 'text-primary inline-flex h-auto max-w-full gap-1.5 rounded-sm px-2 py-1 text-xs'
            }
          >
            <span>[{citation.n}]</span>
            {!inline ? <span className="max-w-48 truncate">{title}</span> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="bg-popover text-popover-foreground border-border flex max-w-[min(24rem,calc(100vw-2rem))] flex-col items-start gap-2 rounded-lg border p-3 shadow-soft [&_svg]:bg-popover [&_svg]:fill-popover"
        >
          <p className="text-sm font-medium wrap-anywhere">{title}</p>
          <p className="text-muted-foreground max-h-60 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {citation.snippet ??
              (pending
                ? 'The source excerpt will appear when the answer finishes.'
                : 'Source preview unavailable.')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
