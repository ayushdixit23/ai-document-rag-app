import { withDeadline } from './deadline.js';
import { isIndexing } from './document-wait-state.js';
import type { PreparedTurn } from './prepare-turn.js';
import type { QueryDependencies } from './query-pipeline.js';
import type { RouteDecision } from './route-policy.js';
import { selectRoute } from './select-route.js';
import type { Source, TurnStream } from './types.js';
import { waitForDocuments } from './wait-for-documents.js';

const retrieve = async (
  turn: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
  decision: RouteDecision,
) => {
  const uploadOnly = !turn.input.content && turn.input.documentIds.length > 0;
  const ready = turn.documents.filter(
    (row) => row.status === 'ready' && (!uploadOnly || turn.input.documentIds.includes(row.id)),
  );
  if (decision.route === 'general')
    return { sources: [], documentRoute: false, retrievalFailed: false };
  if (!ready.length) return { sources: [], documentRoute: true, retrievalFailed: false };
  try {
    const sources: Source[] = await withDeadline(
      (signal) =>
        dependencies.retrieveSources(
          turn.userId,
          ready.map((row) => row.id),
          decision.standaloneQuery,
          signal,
          ready.map(({ id, updatedAt }) => ({ id, updatedAt })),
        ),
      stream.signal,
      8_000,
    );
    stream.signal.throwIfAborted();
    return {
      sources,
      documentRoute: true,
      retrievalFailed: false,
      routingFallback: decision.fallback,
    };
  } catch (error) {
    stream.signal.throwIfAborted();
    dependencies.reportRetrievalError?.(error, turn.chat.id);
    return {
      sources: [],
      documentRoute: true,
      retrievalFailed: true,
      routingFallback: decision.fallback,
    };
  }
};

export const findSources = async (
  initial: PreparedTurn,
  stream: TurnStream,
  dependencies: QueryDependencies,
) => {
  const decision = await selectRoute(initial, stream, dependencies);
  // New attachments must finish indexing even if classification chooses a general answer.
  const requiredIds = [
    ...new Set([
      ...initial.input.documentIds,
      ...(decision.route === 'documents'
        ? initial.documents.filter(isIndexing).map((row) => row.id)
        : []),
    ]),
  ];
  const turn = await waitForDocuments(initial, stream, dependencies.documents, requiredIds);
  return { turn, ...(await retrieve(turn, stream, dependencies, decision)) };
};
