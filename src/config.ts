import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Always load from the API's own .env, even when started from a parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessExpiresIn: '15m',
    refreshExpiresIn: '14d',
  },

  email: {
    from: process.env.EMAIL_FROM ?? 'FadeKey <noreply@fadekey.app>',
    apiKey: process.env.RESEND_API_KEY ?? '',
  },

  app: {
    url: process.env.APP_URL ?? 'http://localhost:3000',
  },

  limits: {
    maxPayloadBytes:  parseInt(process.env.MAX_PAYLOAD_SIZE_BYTES ?? '102400', 10),
    maxTtlSeconds:    60 * 60 * 24 * 7,
    minTtlSeconds:    60,
    maxViews:         100,
    freeMonthlyItems: parseInt(process.env.FREE_MONTHLY_ITEMS ?? '10',   10),
    proMonthlyItems:  parseInt(process.env.PRO_MONTHLY_ITEMS  ?? '5000', 10),
  },

  playground: {
    tokenSecret: process.env.PLAYGROUND_TOKEN_SECRET ?? process.env.JWT_ACCESS_SECRET ?? '',
    sessionTtlSeconds: parseInt(process.env.PLAYGROUND_SESSION_TTL_SECONDS ?? '900', 10),
    maxPayloadBytes: parseInt(process.env.PLAYGROUND_MAX_PAYLOAD_SIZE_BYTES ?? '20480', 10),
    maxTtlSeconds: parseInt(process.env.PLAYGROUND_MAX_TTL_SECONDS ?? '86400', 10),
    maxViews: parseInt(process.env.PLAYGROUND_MAX_VIEWS ?? '3', 10),
    createDailyLimit: parseInt(process.env.PLAYGROUND_CREATE_DAILY_LIMIT ?? '20', 10),
    readDailyLimit: parseInt(process.env.PLAYGROUND_READ_DAILY_LIMIT ?? '40', 10),
  },

  contact: {
    // Destination for contact-form submissions — set CONTACT_EMAIL in env only,
    // never hard-code an address in source code.
    toEmail: process.env.CONTACT_EMAIL ?? '',
  },
} as const

export type Config = typeof config

// ── Startup diagnostics (dev only) ─────────────────────────────────────────
if (config.env !== 'production') {
  const missing: string[] = []
  if (!config.contact.toEmail) missing.push('CONTACT_EMAIL')
  if (!config.email.apiKey)    missing.push('RESEND_API_KEY')
  if (missing.length) {
    console.warn(`[config] Missing optional env vars: ${missing.join(', ')} — contact form will not work.`)
  }
}

if (config.env === 'production') {
  if (!config.jwt.accessSecret || !config.jwt.refreshSecret) {
    throw new Error('Missing JWT secrets: set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production.')
  }
}
