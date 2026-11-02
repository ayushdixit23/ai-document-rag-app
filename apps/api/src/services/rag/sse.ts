import { once } from 'node:events';

import type { Response } from 'express';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import type { StreamEvents, TurnStream } from './types.js';

const HEARTBEAT_MS = 15_000;
const STREAM_TIMEOUT_MS = 5 * 60 * 1_000;

export const isResponseOpen = (res: Response): boolean => !res.destroyed && !res.writableEnded;

export const startSse = (res: Response): TurnStream & { close: () => void } => {
  const controller = new AbortController();
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const onClose = () => {
    controller.abort();
  };
  res.once('close', onClose);
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded && !res.writableNeedDrain)
      res.write(': heartbeat\n\n');
  }, HEARTBEAT_MS);
  const timeout = setTimeout(() => {
    controller.abort(
      new AppError('Response timed out. Please try again.', 408, ERROR_CODES.REQUEST_TIMEOUT),
    );
  }, STREAM_TIMEOUT_MS);
  const send = async <K extends keyof StreamEvents>(
    event: K,
    data: StreamEvents[K],
  ): Promise<void> => {
    controller.signal.throwIfAborted();
    if (res.destroyed || res.writableEnded) return;
    if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
      await once(res, 'drain', { signal: controller.signal });
    }
  };
  return {
    signal: controller.signal,
    send,
    close: () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      res.off('close', onClose);
      if (!res.writableEnded) res.end();
    },
  };
};
