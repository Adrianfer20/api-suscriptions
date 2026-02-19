import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PORT } from './config/index';
import firebaseApp from './config/firebase';
import firebaseAdmin from './config/firebaseAdmin';
import twilioClient from './config/twilio';
import { randomUUID } from 'crypto';
import authRoutes from './auth/routes/auth.routes';
import clientsRoutes from './clients/routes/client.routes';
import subscriptionsRoutes from './subscriptions/routes/subscription.routes';
import communicationsRoutes from './communications/routes/communications.routes';
import automationRoutes from './automation/routes/automation.routes';
import { startDailyAutomationJob } from './automation/jobs/daily.job';

const app = express();
const port = PORT;

// Confía en el proxy de Railway (necesario para rate-limit y obtener la IP correcta)
app.set('trust proxy', 1); 

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://192.168.1.6:5173',
  'https://adrianfer20.github.io'
];
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : defaultCorsOrigins;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Permitir solicitudes sin origen (como Postman o curl)
    if (!origin) return callback(null, true);
    
    // Permitir si el origen está en la lista permitida o si se permite todo ('*')
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`[CORS] Bloqueado origen: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));

// Health/status - Moved up to avoid body-parser timeouts on health checks
app.get('/', (req, res) => {
  return res.json({
    status: 'ok',
    firebaseClient: firebaseApp ? 'initialized' : 'not-initialized',
    firebaseAdmin: firebaseAdmin ? 'admin-initialized' : 'admin-not-initialized',
    twilio: twilioClient ? 'available' : 'not-configured'
  });
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true })); // Necesario para Webhooks de Twilio

// Basic rate limiter (global)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);

// Request logging + requestId (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader ? requestIdHeader : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    console.log(`[req] ${requestId} ${req.method} ${req.path}`);
    next();
  });
} else {
  app.use((req, res, next) => {
    const requestIdHeader = req.headers['x-request-id'];
    if (typeof requestIdHeader === 'string' && requestIdHeader) {
      req.requestId = requestIdHeader;
      res.setHeader('X-Request-Id', requestIdHeader);
    }
    next();
  });
}

// Mount auth module
app.use('/auth', authRoutes);

// Mount clients module
app.use('/clients', clientsRoutes);

// Mount subscriptions module
app.use('/subscriptions', subscriptionsRoutes);

// Mount communications module
app.use('/communications', communicationsRoutes);

// Mount automation module
app.use('/automation', automationRoutes);

import errorHandler from './middlewares/errorHandler';

// Central error handler
app.use(errorHandler);

// Inicializar el trabajo de automatización diario (si no está en el entorno de prueba)
if (process.env.NODE_ENV !== 'test') startDailyAutomationJob();

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;
