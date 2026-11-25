import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Error with an HTTP status and a stable machine-readable code (translated on the client). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (code = 'unauthorized') => new HttpError(401, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string, message?: string) => new HttpError(409, code, message);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function ah<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };
}

/** Removes characters that are not allowed in file names (keeps Arabic letters). */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'mushaf';
}

export function toId(value: unknown, code = 'invalid_id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(code);
  return n;
}
