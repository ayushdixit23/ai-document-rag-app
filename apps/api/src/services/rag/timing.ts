import { logger } from '../../utils/logger.js';

export const timeStage = async <T>(
  stage: string,
  context: Record<string, string>,
  work: () => Promise<T>,
): Promise<T> => {
  const started = performance.now();
  try {
    return await work();
  } finally {
    logger.debug(
      { ...context, stage, durationMs: Math.round(performance.now() - started) },
      'RAG stage',
    );
  }
};
