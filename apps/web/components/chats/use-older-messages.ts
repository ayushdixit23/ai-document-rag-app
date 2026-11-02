'use client';

import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { useChatStore } from '@/lib/chats/store';
import type { HistoryPageState } from '@/lib/chats/store-types';

type Options = {
  chatId?: string;
  page?: HistoryPageState;
  following: boolean;
  scroller: RefObject<HTMLDivElement | null>;
  prepareForPrepend: () => void;
};

export function useOlderMessages({
  chatId,
  page,
  following,
  scroller,
  prepareForPrepend,
}: Options) {
  const sentinel = useRef<HTMLDivElement>(null);
  const loadOlderMessages = useChatStore((state) => state.loadOlderMessages);
  const load = useCallback(() => {
    if (!chatId || !page?.hasMore || page.loading) return;
    prepareForPrepend();
    void loadOlderMessages(chatId);
  }, [chatId, page, prepareForPrepend, loadOlderMessages]);
  useEffect(() => {
    const target = sentinel.current;
    const root = scroller.current;
    if (!target || !root || following || !page?.hasMore || page.loading || page.error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      },
      { root, rootMargin: '120px 0px 0px' },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [following, page, scroller, load]);
  return { sentinel, load };
}
