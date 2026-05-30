import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'
import 'fastify'

// ── JWT payload ───────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string
  email: string
  plan: string
  twoFactorPassed: boolean
}

// ── Fastify augmentation ──────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    redis: Redis
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
