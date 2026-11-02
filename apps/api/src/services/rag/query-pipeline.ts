import type { BaseMessage } from '@langchain/core/messages';

import type { saveAssistantMessage } from '../chats/message.repository.js';
import { parseCitations, publicCitations } from './citations.js';
import type { PreparedTurn } from './prepare-turn.js';
import { buildAnswerPrompt } from './prompt.js';
import type { retrieveSources } from './retrieval.js';
import type { routeQuestion } from './router.js';
import type { Source, TurnStream } from './types.js';

export interface QueryDependencies {
  routeQuestion: typeof routeQuestion;
  retrieveSources: typeof retrieveSources;
  saveAssistantMessage: typeof saveAssistantMessage;
  streamAnswer: (
    messages: BaseMessage[],
    signal: AbortSignal,
  ) => Promise<AsyncIterable<{ text: string }>>;
  scheduleSummary: (chatId: string) => void;
}

const findSources = async (
  turn: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
) => {
  const ready = turn.documents.filter((row) => row.status === 'ready');
  if (!ready.length) return { sources: [], documentRoute: false };
  const decision = await dependencies.routeQuestion({
    content: turn.input.content || 'Describe the attached documents.',
    summary: turn.chat.summary,
    history: turn.history,
    documentNames: ready.map((row) => row.name),
    hasNewAttachments: turn.input.documentIds.length > 0,
    signal: stream.signal,
  });
  const documentRoute = decision.route === 'documents';
  const sources: Source[] = documentRoute
    ? await dependencies.retrieveSources(
        turn.userId,
        ready.map((row) => row.id),
        decision.standaloneQuery,
      )
    : [];
  return { sources, documentRoute };
};

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
  turn: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
): Promise<void> => {
  const processing = turn.documents.filter((row) => ['pending', 'processing'].includes(row.status));
  await stream.send('meta', {
    userMessageId: turn.userMessageId,
    processingDocumentIds: processing.map((row) => row.id),
  });
  const { sources, documentRoute } = await findSources(turn, stream, dependencies);
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
    processingNames: processing.map((row) => row.name),
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
  dependencies.scheduleSummary(turn.chat.id);
};
