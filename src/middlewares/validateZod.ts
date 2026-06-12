import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export default function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }));
      const combinedMessage = issues
        .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
        .join('; ');
      return res.status(400).json({
        ok: false,
        message: combinedMessage,
        errors: issues
      });
    }
    req.validatedData = result.data;
    return next();
  };
}
