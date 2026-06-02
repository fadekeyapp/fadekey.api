import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Always load from the API's own .env, even when started from a parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3002', 10),
  host: process.env.HOST ?? '0.0.0.0',

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  },

  limits: {
    maxPayloadBytes:  parseInt(process.env.MAX_PAYLOAD_SIZE_BYTES ?? '102400', 10),
    maxTtlSeconds:    60 * 60 * 24 * 7,
    minTtlSeconds:    60,
    maxViews:         100,
  },

  playground: {
    tokenSecret: process.env.PLAYGROUND_TOKEN_SECRET ?? 'playground-fallback-secret-key-32-chars-at-least',
    sessionTtlSeconds: parseInt(process.env.PLAYGROUND_SESSION_TTL_SECONDS ?? '900', 10),
    maxPayloadBytes: parseInt(process.env.PLAYGROUND_MAX_PAYLOAD_SIZE_BYTES ?? '20480', 10),
    maxTtlSeconds: parseInt(process.env.PLAYGROUND_MAX_TTL_SECONDS ?? '86400', 10),
    maxViews: parseInt(process.env.PLAYGROUND_MAX_VIEWS ?? '3', 10),
    createDailyLimit: parseInt(process.env.PLAYGROUND_CREATE_DAILY_LIMIT ?? '20', 10),
    readDailyLimit: parseInt(process.env.PLAYGROUND_READ_DAILY_LIMIT ?? '40', 10),
  },
} as const

export type Config = typeof config
