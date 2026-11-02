import { ScrollFollower } from '@/lib/chats/scroll-follower';

export function observeChatScroll(
  element: HTMLElement,
  body: HTMLElement,
  onChange: (following: boolean) => void,
) {
  const controller = new ScrollFollower(element, onChange);
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
  return {
    controller,
    dispose: () => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchmove', onTouch);
      element.removeEventListener('keydown', onKey);
      controller.dispose();
    },
  };
}
