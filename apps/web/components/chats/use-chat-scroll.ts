'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { ScrollFollower } from '@/lib/chats/scroll-follower';

export function useChatScroll(turnId?: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follower = useRef<ScrollFollower | null>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    const body = content.current;
    if (!element || !body) return;
    const controller = new ScrollFollower(element, setFollowing);
    follower.current = controller;
    controller.jump();
    const observer = new ResizeObserver(() => {
      controller.update();
    });
    observer.observe(body);
    observer.observe(element);
    const onScroll = () => {
      controller.onScroll();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) controller.pause();
    };
    const onTouch = () => {
      controller.pause();
    };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) controller.pause();
      if (event.key === 'End') controller.jump();
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchmove', onTouch, { passive: true });
    element.addEventListener('keydown', onKey);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchmove', onTouch);
      element.removeEventListener('keydown', onKey);
      controller.dispose();
      follower.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    follower.current?.resume();
  }, [turnId]);
  return {
    scroller,
    content,
    following,
    jumpToLatest: () => {
      follower.current?.jump();
    },
  };
}
