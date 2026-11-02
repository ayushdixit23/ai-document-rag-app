import type { Request, Response } from 'express';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { sendMessageSchema } from '../core/validation/schemas/chats.schema.js';
import { resourceParamsSchema } from '../core/validation/schemas/documents.schema.js';
import { untilAborted } from '../services/rag/abortable.js';
import { answerTurn } from '../services/rag/answer-turn.js';
import { prepareTurn } from '../services/rag/prepare-turn.js';
import { isResponseOpen, startSse } from '../services/rag/sse.js';
import { logger } from '../utils/logger.js';
import { requireUserId } from '../utils/request-user.js';

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const { id } = resourceParamsSchema.parse(req.params);
  const turn = await prepareTurn(requireUserId(req), id, sendMessageSchema.parse(req.body));
  if (res.headersSent || !isResponseOpen(res)) return;
  const stream = startSse(res);
  try {
    await untilAborted(() => answerTurn(turn, stream), stream.signal);
  } catch (error) {
    logger.error({ err: error, chatId: id, traceId: req.traceId }, 'Chat turn failed');
    if (isResponseOpen(res)) {
      const reason: unknown = stream.signal.aborted ? stream.signal.reason : error;
      const code = reason instanceof AppError ? reason.code : ERROR_CODES.EXTERNAL_SERVICE_ERROR;
      const message =
        reason instanceof AppError
          ? reason.message
          : 'Unable to complete the response. Please try again.';
      res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
    }
  } finally {
    stream.close();
  }
};
