// import { logger } from '../../utils/logger.js';

export const timeStage = async <T>(
  _stage: string,
  _context: Record<string, string>,
  work: () => Promise<T>,
): Promise<T> => {
  // const started = performance.now();
  const result = await work();
  // logger.debug(
  //   { ..._context, stage: _stage, durationMs: Math.round(performance.now() - started) },
  //   'RAG stage',
  // );
  return result;
};
