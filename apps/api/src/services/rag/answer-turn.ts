import { logger } from '../../utils/logger.js';
import { saveAssistantMessage } from '../chats/message.repository.js';
import { enqueueSummary } from './jobs.js';
import { chatModel } from './models.js';
import type { PreparedTurn } from './prepare-turn.js';
import { runQueryPipeline } from './query-pipeline.js';
import { retrieveSources } from './retrieval.js';
import { routeQuestion } from './router.js';
import type { TurnStream } from './types.js';

export const answerTurn = (turn: PreparedTurn, stream: TurnStream): Promise<void> =>
  runQueryPipeline(turn, stream, {
    routeQuestion,
    retrieveSources,
    saveAssistantMessage,
    streamAnswer: (messages, signal) => chatModel.stream(messages, { signal }),
    scheduleSummary: (chatId) => {
      void enqueueSummary(chatId).catch((error: unknown) => {
        logger.error({ err: error, chatId }, 'Unable to queue summary');
      });
    },
  });
