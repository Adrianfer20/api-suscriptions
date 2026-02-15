import { Request, Response, NextFunction } from 'express';

let Sentry: any = null;
if (process.env.SENTRY_DSN) {
  try {
    // Lazy require to keep Sentry optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    console.info('[errorHandler] Sentry initialized');
  } catch (err) {
    console.warn('[errorHandler] @sentry/node not installed or failed to init');
    Sentry = null;
  }
}

export default function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Ignorar errores de conexión interrumpida (comunes en health checks o desconexiones de clientes)
  if (err?.type === 'entity.parse.failed' || err?.message === 'request aborted' || err?.code === 'ECONNABORTED') {
     console.warn(`[client-error] Connection aborted or bad request: ${err.message}`);
     return; // No devolver respuesta ya que la conexión se cerró
  }

  // Log details server-side
  console.error('[error]', err && err.stack ? err.stack : err);
  if (Sentry) {
    try {
      Sentry.captureException(err);
    } catch (e) {
      console.warn('[errorHandler] failed to capture to Sentry', e);
    }
  }

  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err?.message || 'Internal Server Error');
  return res.status(status).json({ ok: false, message });
}
