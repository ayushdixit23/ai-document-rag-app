import type { Request, Response } from 'express';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { SuccessResponse } from '../core/responses/SuccessResponse.js';
import type { PersonalizationPrefsInput } from '../core/validation/schemas/personalization.schema.js';
import { getUserPreferences, upsertUserPreferences } from '../services/preferences.service.js';
import { requireUserId } from '../utils/request-user.js';

export const getMe = (req: Request, res: Response): Response => {
  const session = req.session;
  if (!session) {
    throw new AppError('Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  return new SuccessResponse('Authenticated session', {
    user: session.user,
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
  }).send(req, res);
};

export const getPreferences = async (req: Request, res: Response): Promise<Response> => {
  const prefs = await getUserPreferences(requireUserId(req));
  return new SuccessResponse('Preferences loaded', { prefs }).send(req, res);
};

export const putPreferences = async (req: Request, res: Response): Promise<Response> => {
  const body = req.body as PersonalizationPrefsInput;
  const prefs = await upsertUserPreferences(requireUserId(req), body);
  return new SuccessResponse('Preferences saved', { prefs }).send(req, res);
};
