import type { Request, Response } from 'express';

import { SuccessResponse } from '../core/responses/SuccessResponse.js';
import { resourceParamsSchema } from '../core/validation/schemas/documents.schema.js';
import { generateChatTitle } from '../services/chats/title.js';
import { requireUserId } from '../utils/request-user.js';

export const generateTitle = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const chat = await generateChatTitle(requireUserId(req), id);
  return new SuccessResponse('Chat title generated', { chat }).send(req, res);
};
