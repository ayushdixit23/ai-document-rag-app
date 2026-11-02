import { untilAborted } from './abortable.js';

export const withDeadline = async <T>(
  work: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  timeoutMs: number,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error('Model deadline exceeded'));
  }, timeoutMs);
  const signal = AbortSignal.any([parent, controller.signal]);
  try {
    return await untilAborted(() => work(signal), signal);
  } finally {
    clearTimeout(timer);
  }
};
