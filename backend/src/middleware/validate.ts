import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from '../utils/http.js';

type Part = 'body' | 'query' | 'params';

/** Validates and replaces req[part] with the parsed (coerced, stripped) value. */
export function validate(schema: ZodTypeAny, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(
        badRequest(
          'validation_failed',
          'Request validation failed',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
    }
    // req.query is a getter in newer express versions; assign defensively
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
    next();
  };
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const trimmed = (max = 2000) => z.string().trim().min(1).max(max);
export const optionalText = (max = 2000) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
