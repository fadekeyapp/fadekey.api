import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'

/**
 * Public item routes — no authentication required.
 * These are the core zero-knowledge endpoints:
 *   POST /api/items  — store an encrypted blob
 *   GET  /api/items/:id — retrieve and destroy (one-time) or decrement view count
 *
 * The server never sees the plaintext. The decryption key travels in the URL
 * fragment (#key) and is never sent in any HTTP request.
 */

const createItemSchema = z.object({
  ciphertext: z.string().min(1).max(config.limits.maxPayloadBytes),
  iv: z.string().length(16), // 12-byte IV, base64url = 16 chars
  ttl: z
    .number()
    .int()
    .min(config.limits.minTtlSeconds)
    .max(config.limits.maxTtlSeconds)
    .default(3600),
  maxViews: z
    .number()
    .int()
    .min(1)
    .max(config.limits.maxViews)
    .optional(),
  passwordHash: z
    .string()
    .max(256)
    .optional(), // PBKDF2-derived hash for extra password protection
})

type PlaygroundSession = {
  exp: number
  ip: string
  uaHash: string
}

function toBase64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

async function createPlaygroundToken(request: any) {
  const { createHash, createHmac } = await import('node:crypto')
  const payload: PlaygroundSession = {
    exp: Date.now() + config.playground.sessionTtlSeconds * 1000,
    ip: request.ip,
    uaHash: createHash('sha256').update(String(request.headers['user-agent'] ?? '')).digest('hex'),
  }

  const encodedPayload = toBase64url(JSON.stringify(payload))
  const signature = createHmac('sha256', config.playground.tokenSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

async function verifyPlaygroundToken(request: any, token: string): Promise<PlaygroundSession | null> {
  if (!config.playground.tokenSecret || !token.includes('.')) return null

  const { createHash, createHmac, timingSafeEqual } = await import('node:crypto')
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = createHmac('sha256', config.playground.tokenSecret)
    .update(encodedPayload)
    .digest('base64url')

  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PlaygroundSession
    if (!payload?.exp || payload.exp < Date.now()) return null
    const isLocalhost = (ip: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
    const isSameIp = payload.ip === request.ip || (isLocalhost(payload.ip) && isLocalhost(request.ip))
    if (!isSameIp) return null

    const uaHash = createHash('sha256').update(String(request.headers['user-agent'] ?? '')).digest('hex')
    if (payload.uaHash !== uaHash) return null

    return payload
  } catch {
    return null
  }
}

async function checkPlaygroundUsageLimit(fastify: any, request: any, action: 'create' | 'read') {
  const dateKey = new Date().toISOString().slice(0, 10)
  const key = `playground:${action}:${request.ip}:${dateKey}`
  const limit = action === 'create' ? config.playground.createDailyLimit : config.playground.readDailyLimit
  const count = await fastify.redis.incr(key)

  if (count === 1) {
    await fastify.redis.expire(key, 60 * 60 * 48)
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
  }
}

const itemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/playground/session', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.ip,
      },
    },
    handler: async (request, reply) => {
      if (!config.playground.tokenSecret) {
        return reply.status(503).send({ error: 'Playground is not configured.' })
      }

      const token = await createPlaygroundToken(request)
      return reply.send({ token, expiresIn: config.playground.sessionTtlSeconds })
    },
  })

  // ── POST /api/items ──────────────────────────────────────────────────────────
  fastify.post('/items', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.ip,
      },
    },
    handler: async (request, reply) => {
      const body = createItemSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten().fieldErrors })
      }

      const playgroundToken = typeof request.headers['x-playground-token'] === 'string'
        ? request.headers['x-playground-token']
        : undefined
      const playgroundSession = playgroundToken
        ? await verifyPlaygroundToken(request, playgroundToken)
        : null
      if (playgroundToken && !playgroundSession) {
        return reply.status(401).send({ error: 'Invalid or expired playground session. Please reload the docs page.' })
      }
      const isPlayground = Boolean(playgroundSession)

      if (isPlayground) {
        const usage = await checkPlaygroundUsageLimit(fastify, request, 'create')
        void reply.header('X-Playground-Quota-Limit', usage.limit)
        void reply.header('X-Playground-Quota-Remaining', usage.remaining)

        if (!usage.allowed) {
          return reply.status(429).send({
            error: 'Playground limit reached. Please try again later.',
            quota: { limit: usage.limit, remaining: usage.remaining },
          })
        }
      }

      const payloadSizeBytes = Buffer.byteLength(body.data.ciphertext, 'utf8')
      const maxPayloadBytes = isPlayground ? config.playground.maxPayloadBytes : config.limits.maxPayloadBytes
      if (payloadSizeBytes > maxPayloadBytes) {
        return reply.status(400).send({
          error: `Payload too large. Maximum allowed is ${maxPayloadBytes} bytes.`,
        })
      }

      // Limits are applied based on playground mode vs standard limits.
      const effectiveTtl = isPlayground
        ? Math.min(body.data.ttl, config.playground.maxTtlSeconds)
        : Math.min(body.data.ttl, config.limits.maxTtlSeconds)

      const effectiveMaxViews = isPlayground
        ? Math.min(body.data.maxViews ?? 1, config.playground.maxViews)
        : (body.data.maxViews ? Math.min(body.data.maxViews, config.limits.maxViews) : null)

      const { ciphertext, iv, passwordHash } = body.data
      const { randomUUID } = await import('node:crypto')
      const id = randomUUID()

      const payload = JSON.stringify({
        ciphertext,
        iv,
        maxViews: effectiveMaxViews,
        views: 0,
        passwordHash: passwordHash ?? null,
        createdAt: Date.now(),
        isPlayground,
      })

      await fastify.redis.set(`item:${id}`, payload, 'EX', effectiveTtl)

      return reply.status(201).send({
        id,
        expiresAt: new Date(Date.now() + effectiveTtl * 1000).toISOString(),
        effectiveTtl,
        effectiveMaxViews,
        mode: isPlayground ? 'playground' : 'production',
      })
    },
  })

  // ── GET /api/items/:id ───────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/items/:id',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      handler: async (request, reply) => {
        const { id } = request.params

        const playgroundToken = typeof request.headers['x-playground-token'] === 'string'
          ? request.headers['x-playground-token']
          : undefined
        const playgroundSession = playgroundToken
          ? await verifyPlaygroundToken(request, playgroundToken)
          : null
        if (playgroundToken && !playgroundSession) {
          return reply.status(401).send({ error: 'Invalid or expired playground session. Please reload the docs page.' })
        }
        if (playgroundSession) {
          const usage = await checkPlaygroundUsageLimit(fastify, request, 'read')
          void reply.header('X-Playground-Quota-Limit', usage.limit)
          void reply.header('X-Playground-Quota-Remaining', usage.remaining)

          if (!usage.allowed) {
            return reply.status(429).send({
              error: 'Playground limit reached. Please try again later.',
              quota: { limit: usage.limit, remaining: usage.remaining },
            })
          }
        }

        // Validate UUID to prevent path traversal / injection
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          return reply.status(400).send({ error: 'Invalid item ID.' })
        }

        const raw = await fastify.redis.get(`item:${id}`)
        if (!raw) {
          return reply.status(404).send({ error: 'Item not found or already expired.' })
        }

        const item = JSON.parse(raw) as {
          ciphertext: string
          iv: string
          maxViews: number | null
          views: number
          passwordHash: string | null
          createdAt: number
          isPlayground?: boolean
        }

        if (item.isPlayground && !playgroundSession) {
          return reply.status(403).send({ error: 'Playground secrets can only be decrypted within the API documentation playground.' })
        }

        // Optional password check (compare hashes client-side derived, not plaintext)
        const providedHash =
          (request.headers['x-password-hash'] as string | undefined) ||
          (request.body as { passwordHash?: string } | undefined)?.passwordHash

        if (item.passwordHash && item.passwordHash !== providedHash) {
          return reply.status(401).send({ error: 'Invalid password.' })
        }

        item.views += 1
        const ttl = await fastify.redis.ttl(`item:${id}`)
        const isDestroyed = item.maxViews !== null && item.views >= item.maxViews

        if (isDestroyed) {
          // Destroy on final view
          await fastify.redis.del(`item:${id}`)
        } else {
          await fastify.redis.set(`item:${id}`, JSON.stringify(item), 'EX', ttl)
        }

        return reply.send({
          ciphertext: item.ciphertext,
          iv: item.iv,
          hasPassword: item.passwordHash !== null,
          views: item.views,
          maxViews: item.maxViews,
          destroyed: isDestroyed,
        })
      },
    },
  )
}

export default itemRoutes
