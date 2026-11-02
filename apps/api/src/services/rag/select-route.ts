import type { PreparedTurn } from './prepare-turn.js';
import type { QueryDependencies } from './query-pipeline.js';
import type { RouteDecision } from './route-policy.js';
import type { TurnStream } from './types.js';

export const selectRoute = async (
  turn: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
): Promise<RouteDecision> => {
  const available = turn.documents.filter((row) => row.status !== 'uploading');
  if (!available.length) return { route: 'general', standaloneQuery: turn.input.content };
  if (!turn.input.content && turn.input.documentIds.length)
    return { route: 'documents', standaloneQuery: 'Describe the attached documents.' };
  return dependencies.routeQuestion({
    content: turn.input.content,
    summary: turn.chat.summary,
    history: turn.history,
    documentNames: available.map((row) => row.name),
    hasNewAttachments: turn.input.documentIds.length > 0,
    signal: stream.signal,
  });
};
