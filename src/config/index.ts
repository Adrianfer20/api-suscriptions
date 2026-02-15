import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Load optional local secrets file (not committed) and merge into process.env
try {
  const secretsPath = path.resolve(process.cwd(), 'config', 'secrets.json');
  if (fs.existsSync(secretsPath)) {
    const raw = fs.readFileSync(secretsPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const k of Object.keys(parsed)) {
      if (!process.env[k] || process.env[k] === '') process.env[k] = parsed[k];
    }
  }
} catch (err) {
  // ignore parsing errors — keep running with env vars
}

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export const TWILIO_CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  from: process.env.TWILIO_FROM_NUMBER || ''
};

// Validation: required and recommended variables
const REQUIRED = [
  // project may work without these, but enforce presence for production
  'NODE_ENV'
];

const RECOMMENDED = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
];

function missingVars(list: string[]) {
  return list.filter((k) => !process.env[k] || process.env[k] === '');
}

const missingRequired = missingVars(REQUIRED);
if (missingRequired.length) {
  console.warn(`[config] Variables de entorno requeridas ausentes: ${missingRequired.join(', ')}.`);
  console.warn('[config] Se recomienda definir NODE_ENV (development|production|test).');
}

const missingRecommended = missingVars(RECOMMENDED);
if (missingRecommended.length) {
  console.info(`[config] Variables recomendadas no encontradas: ${missingRecommended.join(', ')}.`);
  console.info('[config] Si necesitas funcionalidades de Firebase Admin o Twilio, completa estas variables.');
}

export const HAS_FIREBASE_ADMIN = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
export const HAS_TWILIO = !!(TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken);

export function assertEnvForProduction() {
  if (process.env.NODE_ENV === 'production') {
    // Requires EITHER a file path OR the raw JSON credentials
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_ADMIN_CREDENTIALS) {
      throw new Error(`[config] En producción se requiere: GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_ADMIN_CREDENTIALS`);
    }
  }
}

// Ejecutar validaciones básicas al cargar el módulo
try {
  assertEnvForProduction();
} catch (err) {
  // Lanza solo en producción; en dev se muestran warnings
  throw err;
}
