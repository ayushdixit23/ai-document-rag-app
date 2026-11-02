import type { BaseMessage } from '@langchain/core/messages';

import { logger } from '../../utils/logger.js';
import { saveAssistantMessage } from '../chats/message.repository.js';
import { getAttachments, publicDocument } from '../documents/document.repository.js';
import { enqueueSummary } from './jobs.js';
import { chatModel } from './models.js';
import type { PreparedTurn } from './prepare-turn.js';
import { runQueryPipeline } from './query-pipeline.js';
import { retrieveSources } from './retrieval.js';
import { routeQuestion } from './router.js';
import { timeStage } from './timing.js';
import type { TurnStream } from './types.js';

const streamAnswer = async function* (
  messages: BaseMessage[],
  signal: AbortSignal,
  chatId: string,
) {
  const started = performance.now();
  let first = true;
  const chunks = await timeStage('open model stream', { chatId }, () =>
    chatModel.stream(messages, { signal }),
  );
  try {
    for await (const chunk of chunks) {
      if (first && chunk.text) {
        first = false;
        logger.debug(
          {
            chatId,
            stage: 'model first token',
            durationMs: Math.round(performance.now() - started),
          },
          'RAG stage',
        );
      }
      yield chunk;
    }
  } finally {
    logger.debug(
      { chatId, stage: 'model stream', durationMs: Math.round(performance.now() - started) },
      'RAG stage',
    );
  }
};

export const answerTurn = (turn: PreparedTurn, stream: TurnStream): Promise<void> =>
  timeStage('query pipeline', { chatId: turn.chat.id }, () =>
    runQueryPipeline(turn, stream, {
      documents: {
        load: async (userId, ids) => (await getAttachments(userId, ids)).map(publicDocument),
      },
      routeQuestion: (input) =>
        timeStage('route question', { chatId: turn.chat.id }, () => routeQuestion(input)),
      retrieveSources,
      saveAssistantMessage: (...args) =>
        timeStage('save assistant message', { chatId: turn.chat.id }, () =>
          saveAssistantMessage(...args),
        ),
      streamAnswer: (messages, signal) =>
        Promise.resolve(streamAnswer(messages, signal, turn.chat.id)),
      scheduleSummary: (chatId) => {
        void enqueueSummary(chatId).catch((error: unknown) => {
          logger.error({ err: error, chatId }, 'Unable to queue summary');
        });
      },
      reportRetrievalError: (error, chatId) => {
        logger.warn({ err: error, chatId }, 'Document retrieval failed');
      },
    }),
  );
