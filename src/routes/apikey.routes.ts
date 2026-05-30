import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'

const MAX_ACTIVE_KEYS = 10

/**
 * Validates API key names:
 * - Alphanumeric, spaces, hyphens, underscores, and dots only
 * - No HTML/script tags or control characters
 */
const apiKeyNameSchema = z
  .string()
  .min(1, 'Name is required.')
  .max(64, 'Name must not exceed 64 characters.')
  .regex(/^[\w\s\-_.]+$/, 'Name may only contain letters, numbers, spaces, hyphens, underscores, and dots.')
  .transform((s) => s.trim())

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /api/keys ───────────────────────────────────────────────────────────
  fastify.get('/keys', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const keys = await fastify.prisma.apiKey.findMany({
        where: { userId: request.user.sub, revokedAt: null },
        select: {
          id: true,
          name: true,
          prefix: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(keys)
    },
  })

  // ── POST /api/keys ──────────────────────────────────────────────────────────
  fastify.post('/keys', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const body = z.object({ name: apiKeyNameSchema }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten().fieldErrors })
      }

      const active = await fastify.prisma.apiKey.count({
        where: { userId: request.user.sub, revokedAt: null },
      })

      if (active >= MAX_ACTIVE_KEYS) {
        return reply.status(400).send({
          error: `Active key limit of ${MAX_ACTIVE_KEYS} reached. Revoke a key before creating a new one.`,
        })
      }

      const rawKey = `fk_${randomBytes(32).toString('base64url')}`
      const prefix = rawKey.slice(0, 10) // e.g. "fk_abc123" — shown in UI

      // Store only the key hash; the raw key is returned once and never stored
      const { createHash } = await import('node:crypto')
      const keyHash = createHash('sha256').update(rawKey).digest('hex')

      const key = await fastify.prisma.apiKey.create({
        data: {
          name: body.data.name,
          prefix,
          keyHash,
          userId: request.user.sub,
        },
        select: { id: true, name: true, prefix: true, createdAt: true },
      })

      return reply.status(201).send({
        ...key,
        // Raw key is returned only once — the client must store it
        key: rawKey,
      })
    },
  })

  // ── DELETE /api/keys/:id ────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/keys/:id', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const params = z.object({ id: z.string().uuid('Invalid ID.') }).safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid key ID.' })
      }

      const key = await fastify.prisma.apiKey.findFirst({
        where: { id: params.data.id, userId: request.user.sub, revokedAt: null },
      })

      if (!key) {
        return reply.status(404).send({ error: 'Key not found.' })
      }

      await fastify.prisma.apiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      })

      return reply.status(204).send()
    },
  })
}

export default apiKeyRoutes
