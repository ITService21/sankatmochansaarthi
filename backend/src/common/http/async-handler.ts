import { NextFunction, Request, RequestHandler, Response } from "express";

/** Wraps an async route handler so rejected promises reach the error middleware (Express 4 does not do this). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
