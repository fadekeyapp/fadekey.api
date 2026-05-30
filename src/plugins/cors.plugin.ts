import cors from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'

/**
 * CORS in two scopes:
 *
 * PUBLIC  — /api/items
 *   Any origin allowed, credentials disabled.
 *   Clients authenticate via Authorization header (API key), not cookies.
 *   Server-to-server calls (curl, Node, Python) bypass CORS entirely.
 *
 * PRIVATE — /api/auth, /api/dashboard, /api/keys
 *   Only known origins allowed, credentials enabled.
 *   Uses httpOnly refresh cookie (fk_refresh) — must come from a known origin.
 *   Browsers reject `credentials: true` + `origin: '*'` simultaneously.
 */

export const appCorsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    // Use a single CORS registration and vary behavior by path to avoid duplicate OPTIONS '*' routes.
    delegator: (req, cb) => {
      const isPublicItems = req.url.startsWith('/api/items')

      if (isPublicItems) {
        cb(null, {
          origin: '*',
          credentials: false,
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Playground-Token'],
        })
        return
      }

      cb(null, {
        origin: config.cors.origins,
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Playground-Token'],
      })
    },
  })

  // Ensure CORS headers are present on actual responses as well as preflight.
  // Some environments may handle OPTIONS preflight separately; this hook adds
  // the appropriate Access-Control headers for all responses based on path.
  fastify.addHook('onSend', async (request, reply, payload) => {
    try {
      const origin = (request.headers.origin as string) || ''
      const rawUrl = request.raw?.url || request.url || ''
      const isPublicItems = rawUrl.startsWith('/api/items') || rawUrl.startsWith('/items')

      if (isPublicItems) {
        reply.header('Access-Control-Allow-Origin', '*')
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Playground-Token')
      } else if (origin && Array.isArray(config.cors.origins) && config.cors.origins.includes(origin)) {
        reply.header('Access-Control-Allow-Origin', origin)
        reply.header('Access-Control-Allow-Credentials', 'true')
        reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS')
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Playground-Token')
      }
    } catch (err) {
      // Swallow — do not block response on header-fix failures
    }

    return payload
  })
}
