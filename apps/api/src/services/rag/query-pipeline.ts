import type { BaseMessage } from '@langchain/core/messages';

import type { saveAssistantMessage } from '../chats/message.repository.js';
import { parseCitations, publicCitations } from './citations.js';
import { SUMMARY_TRIGGER_TOKENS } from './config.js';
import { estimateTokens, historyText } from './history.js';
import type { PreparedTurn } from './prepare-turn.js';
import { buildAnswerPrompt } from './prompt.js';
import type { retrieveSources } from './retrieval.js';
import type { routeQuestion } from './router.js';
import { findSources } from './source-selection.js';
import type { TurnStream } from './types.js';
import type { DocumentWaitDependencies } from './wait-for-documents.js';

export interface QueryDependencies {
  routeQuestion: typeof routeQuestion;
  retrieveSources: typeof retrieveSources;
  saveAssistantMessage: typeof saveAssistantMessage;
  streamAnswer: (
    messages: BaseMessage[],
    signal: AbortSignal,
  ) => Promise<AsyncIterable<{ text: string }>>;
  scheduleSummary: (chatId: string) => void;
  reportRetrievalError?: (error: unknown, chatId: string) => void;
  documents: DocumentWaitDependencies;
}

const streamAnswer = async (input: {
  prompt: BaseMessage[];
  stream: TurnStream;
  dependencies: QueryDependencies;
}): Promise<string> => {
  let content = '';
  for await (const chunk of await input.dependencies.streamAnswer(
    input.prompt,
    input.stream.signal,
  )) {
    if (!chunk.text) continue;
    content += chunk.text;
    await input.stream.send('token', { text: chunk.text });
  }
  input.stream.signal.throwIfAborted();
  if (!content.trim()) throw new Error('The model returned an empty response.');
  return content;
};

export const runQueryPipeline = async (
  initial: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
): Promise<void> => {
  const processing = initial.documents.filter((row) =>
    ['pending', 'processing'].includes(row.status),
  );
  await stream.send('meta', {
    userMessageId: initial.userMessageId,
    processingDocumentIds: processing.map((row) => row.id),
  });
  const { turn, sources, documentRoute, retrievalFailed, routingFallback } = await findSources(
    initial,
    stream,
    dependencies,
  );
  await stream.send(
    'sources',
    sources.map(({ n, documentId, title, page }) => ({ n, documentId, title, page })),
  );
  const prompt = await buildAnswerPrompt({
    content: turn.input.content || 'Acknowledge the attached documents and their availability.',
    summary: turn.chat.summary,
    history: turn.history,
    sources,
    documentRoute,
    retrievalFailed,
    routingFallback,
    processingNames: turn.documents
      .filter((row) => ['pending', 'processing'].includes(row.status))
      .map((row) => row.name),
    failedNames: turn.documents.filter((row) => row.status === 'failed').map((row) => row.name),
  });
  const content = await streamAnswer({ prompt, stream, dependencies });
  const citations = parseCitations(content, sources);
  const assistantMessageId = await dependencies.saveAssistantMessage(
    turn.chat.id,
    content,
    citations,
  );
  await stream.send('done', { assistantMessageId, citations: publicCitations(citations) });
  const tokens =
    turn.history.reduce((sum, item) => sum + estimateTokens(historyText(item)), 0) +
    estimateTokens(turn.input.content) +
    estimateTokens(content);
  if (tokens > SUMMARY_TRIGGER_TOKENS) dependencies.scheduleSummary(turn.chat.id);
};
