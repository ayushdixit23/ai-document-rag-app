import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { auth } from '../lib/auth/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Requires a valid Better Auth session cookie on the request.
 * Attach to protected routes: `router.get('/me', requireAuth, handler)`.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const started = performance.now();
  void auth.api
    .getSession({ headers: fromNodeHeaders(req.headers), returnHeaders: true })
    .then(({ response: session, headers }) => {
      logger.debug(
        {
          traceId: req.traceId,
          stage: 'authenticate',
          durationMs: Math.round(performance.now() - started),
        },
        'Request stage',
      );
      if (res.destroyed || res.writableEnded || res.headersSent) return;
      for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie);
      if (!session) {
        next(new AppError('Authentication required', 401, ERROR_CODES.UNAUTHORIZED));
        return;
      }

      req.session = session;
      next();
    })
    .catch(next);
};
