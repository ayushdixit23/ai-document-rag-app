import { NextFunction, Request, Response } from 'express';

// import { logger } from '../utils/logger.js';

export const requestLogger = (_req: Request, _res: Response, next: NextFunction) => {
  // const start = Date.now();

  // _res.on('finish', () => {
  //   logger.info(
  //     {
  //       method: _req.method,
  //       url: _req.originalUrl,
  //       statusCode: _res.statusCode,
  //       durationMs: Date.now() - start,
  //       traceId: _req.traceId,
  //     },
  //     'Request completed',
  //   );
  // });

  next();
};
