type Schedule = (callback: () => void) => () => void;

const scheduleFlush: Schedule = (callback) => {
  const timer = setTimeout(callback, 32);
  return () => {
    clearTimeout(timer);
  };
};

/** Show the first text immediately, then combine bursts into at most 30 updates/second. */
export function createTokenBuffer(emit: (text: string) => void, schedule = scheduleFlush) {
  let pending = '';
  let started = false;
  let closed = false;
  let cancel: (() => void) | undefined;
  const flush = () => {
    cancel?.();
    cancel = undefined;
    if (!pending) return;
    const text = pending;
    pending = '';
    emit(text);
  };
  return {
    append(text: string) {
      if (!text || closed) return;
      pending += text;
      if (!started) {
        started = true;
        flush();
      } else cancel ??= schedule(flush);
    },
    flush,
    dispose() {
      closed = true;
      cancel?.();
      cancel = undefined;
      pending = '';
    },
  };
}
