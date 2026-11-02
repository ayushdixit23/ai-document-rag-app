import { NextFunction, Request, Response } from 'express';

import { REQUEST_TIMEOUT_MS } from '../config/env.js';
import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';

export const requestTimeout = (req: Request, res: Response, next: NextFunction): void => {
  const timer = setTimeout(() => {
    clearTimeout(timer);
    if (res.headersSent) return;
    if (!res.writableEnded) {
      const error = new AppError(
        `Request timeout after ${String(REQUEST_TIMEOUT_MS / 1000)} seconds`,
        408,
        ERROR_CODES.REQUEST_TIMEOUT,
      );
      next(error);
    }
  }, REQUEST_TIMEOUT_MS);

  res.on('finish', () => {
    clearTimeout(timer);
  });
  res.on('close', () => {
    clearTimeout(timer);
  });

  next();
};
