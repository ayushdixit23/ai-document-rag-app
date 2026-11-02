import type { Request } from 'express';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';

export const requireUserId = (req: Request): string => {
  if (!req.session) throw new AppError('Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  return req.session.user.id;
};
