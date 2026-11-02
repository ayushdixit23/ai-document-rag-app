'use client';

import { createContext, type ReactNode, use, useMemo } from 'react';
import type { ExtraProps } from 'streamdown';

import { CitationChip } from '@/components/chats/citation-chip';
import type { Citation } from '@/lib/chats/types';

type CitationContextValue = { byNumber: Map<number, Citation>; pending: boolean };
const CitationContext = createContext<CitationContextValue | null>(null);

export function MarkdownCitations({
  citations,
  pending,
  children,
}: {
  citations: Citation[];
  pending: boolean;
  children: ReactNode;
}) {
  // This value changes for retrieval/finalization, not for each text token.
  const value = useMemo(
    () => ({ byNumber: new Map(citations.map((item) => [item.n, item])), pending }),
    [citations, pending],
  );
  return <CitationContext.Provider value={value}>{children}</CitationContext.Provider>;
}

export function MarkdownCitation({ node, children }: ExtraProps & { children?: ReactNode }) {
  const context = use(CitationContext);
  const n = node?.properties['data-citation'];
  const citation = typeof n === 'number' ? context?.byNumber.get(n) : undefined;
  if (!citation) return <>{children}</>;
  return <CitationChip citation={citation} inline pending={context?.pending} />;
}
