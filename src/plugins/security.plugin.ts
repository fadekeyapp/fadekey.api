import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'

/**
 * Adds security headers to every response.
 * Keeps the API hardened without relying on a reverse proxy.
 */
const securityPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    // Security headers
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('X-XSS-Protection', '0') // Modern browsers use CSP; the legacy header can backfire
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    reply.removeHeader('x-powered-by')
    
    // Ensure CORS headers are present for browser requests.
    try {
      const origin = (_request.headers.origin as string) || ''
      const rawUrl = _request.raw?.url || _request.url || ''
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
    } catch {
      // ignore header-setting failures
    }
    return payload
  })
}

export default fp(securityPlugin, { name: 'security' })
