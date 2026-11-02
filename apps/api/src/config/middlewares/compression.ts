import compression from 'compression';
import { RequestHandler } from 'express';

export const compressionMiddleware = (): RequestHandler =>
  compression({
    filter: (req, res) =>
      !res.getHeader('Content-Type')?.toString().startsWith('text/event-stream') &&
      compression.filter(req, res),
  });
