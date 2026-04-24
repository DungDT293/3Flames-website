import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    req[target] = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    formatted[path || '_root'] = issue.message;
  }
  return formatted;
}
