'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { captureScrollAnchor } from '@/lib/chats/scroll-anchor';
import type { ScrollFollower } from '@/lib/chats/scroll-follower';
import { observeChatScroll } from '@/lib/chats/scroll-observer';

export function useChatScroll(turnId?: string, loadingOlder = false) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follower = useRef<ScrollFollower | null>(null);
  const [following, setFollowing] = useState(true);
  const restoreAnchor = useRef<(() => void) | null>(null);
  const prepareForPrepend = useCallback(() => {
    follower.current?.pause();
    const element = scroller.current;
    const anchor = content.current?.querySelector<HTMLElement>('[data-message-id]');
    if (element && anchor) restoreAnchor.current = captureScrollAnchor(element, anchor);
  }, []);
  useLayoutEffect(() => {
    if (loadingOlder || !restoreAnchor.current) return;
    restoreAnchor.current();
    restoreAnchor.current = null;
  });
  useLayoutEffect(() => {
    const element = scroller.current;
    const body = content.current;
    if (!element || !body) return;
    const observed = observeChatScroll(element, body, setFollowing);
    follower.current = observed.controller;
    return () => {
      observed.dispose();
      follower.current = null;
      restoreAnchor.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    follower.current?.resume();
  }, [turnId]);
  return {
    scroller,
    content,
    following,
    prepareForPrepend,
    jumpToLatest: () => {
      follower.current?.jump();
    },
  };
}
