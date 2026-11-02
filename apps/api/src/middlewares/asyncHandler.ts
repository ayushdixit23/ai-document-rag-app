import { NextFunction, Request, Response } from 'express';

/**
 * Type for async route handlers
 */
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;

/**
 * Wrapper for async route handlers to catch errors and pass them to error middleware
 * @param fn - The async route handler function
 * @returns Express middleware function
 */
const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
