import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { releaseChatRequest, reserveChatRequest } from '../services/ai/chat-admission.js';
import { logger } from '../utils/logger.js';
import { requireUserId } from '../utils/request-user.js';

const LIMIT_MESSAGES = {
  day: 'Your daily AI message limit has been reached. Please try again when it resets.',
  minute: 'You are sending AI messages too quickly. Please wait a moment and try again.',
  concurrent: 'Please wait for an active AI response to finish before sending another message.',
};

export const createAiChatLimit =
  (deps = { reserve: reserveChatRequest, release: releaseChatRequest }) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const admission = await deps.reserve(requireUserId(req));
    if (!admission.request_id || admission.reason) {
      res.setHeader('Retry-After', String(Math.max(1, admission.retry_after)));
      throw new AppError(
        LIMIT_MESSAGES[admission.reason ?? 'minute'],
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
      );
    }
    const id = admission.request_id;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      res.off('finish', release);
      res.off('close', release);
      void deps.release(id).catch((error: unknown) => {
        logger.error({ err: error }, 'Unable to release AI turn; concurrency lease will expire');
      });
    };
    res.once('finish', release);
    res.once('close', release);
    if (res.destroyed || res.writableEnded) {
      release();
      return;
    }
    next();
  };

export const aiChatLimit = createAiChatLimit();
