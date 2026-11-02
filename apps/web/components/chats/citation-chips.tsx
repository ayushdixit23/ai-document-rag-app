'use client';

import { CitationChip } from '@/components/chats/citation-chip';
import type { Citation } from '@/lib/chats/types';

export function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="border-border mt-4 border-t pt-3">
      <p className="text-muted-foreground mb-2 text-xs font-medium">Sources</p>
      <ul aria-label="Citations" className="flex flex-wrap gap-2">
        {citations.map((citation) => (
          <li key={`${citation.documentId}:${String(citation.n)}`}>
            <CitationChip citation={citation} />
          </li>
        ))}
      </ul>
    </div>
  );
}
