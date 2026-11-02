import { NextFunction, Request, Response } from 'express';

import { errorDiagnostics } from '../core/errors/errorDiagnostics.js';
import { normalizeError } from '../core/errors/errorHandler.js';
import { ErrorPayload } from '../core/responses/ApiResponse.js';
import { logger } from '../utils/logger.js';

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (res.headersSent) {
    _next(err);
    return;
  }
  const normalizedError = normalizeError(err);

  logger.error(
    {
      traceId: req.traceId,
      code: normalizedError.code,
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      details: normalizedError.details,
      stack: normalizedError.stack,
      causes: errorDiagnostics(err),
    },
    'Request error',
  );

  const payload: ErrorPayload = {
    success: false,
    message: normalizedError.message,
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      traceId: req.traceId ?? 'unknown',
      ...(normalizedError.details && { details: normalizedError.details }),
    },
    statusCode: normalizedError.statusCode,
  };

  res.status(normalizedError.statusCode).json(payload);
};
