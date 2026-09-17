import { ZodError } from 'zod';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Usage: router.post('/path', validate(mySchema), handler)
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ error: 'Datos de entrada inválidos', details: errors });
      }
      next(err);
    }
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ error: 'Parámetros de consulta inválidos', details: errors });
      }
      next(err);
    }
  };
}
