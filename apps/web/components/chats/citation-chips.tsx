'use client';

import { CitationChip } from '@/components/chats/citation-chip';
import type { Citation } from '@/lib/chats/types';

export function CitationChips({
  citations,
  pending,
}: {
  citations: Citation[];
  pending?: boolean;
}) {
  if (!citations.length) return null;
  return (
    <div className="border-border mt-4 border-t pt-3">
      <p className="text-muted-foreground mb-2 text-xs font-medium">
        {pending ? 'Sources found' : 'Sources'}
      </p>
      <ul aria-label="Citations" className="flex flex-wrap gap-2">
        {citations.map((citation) => (
          <li key={`${citation.documentId}:${String(citation.n)}`}>
            <CitationChip citation={citation} pending={pending} />
          </li>
        ))}
      </ul>
    </div>
  );
}
