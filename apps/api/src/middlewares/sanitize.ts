import { NextFunction, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';

const MAX_DEPTH = 10;

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

const sanitizeValue = (value: unknown, depth: number = 0): unknown => {
  if (depth > MAX_DEPTH) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeHtml(value, sanitizeOptions);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val, depth + 1);
    }
    return sanitized;
  }

  return value;
};

export const sanitizeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  // Chat content is plain data (including code/Markdown), never rendered HTML here.
  if (/^\/api\/chats\/[^/]+\/messages\/?$/u.test(req.path)) {
    next();
    return;
  }
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  next();
};
