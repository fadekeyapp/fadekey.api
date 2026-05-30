import type { Redis } from 'ioredis'
import 'fastify'

// ── Fastify augmentation ──────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}
