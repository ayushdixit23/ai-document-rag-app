type Anchor = { isConnected: boolean; getBoundingClientRect: () => { top: number } };

/** Anchor to a retained message so concurrent streaming below it does not shift the reader. */
export function captureScrollAnchor(scroller: { scrollTop: number }, anchor: Anchor): () => void {
  const top = anchor.getBoundingClientRect().top;
  return () => {
    if (anchor.isConnected) scroller.scrollTop += anchor.getBoundingClientRect().top - top;
  };
}
