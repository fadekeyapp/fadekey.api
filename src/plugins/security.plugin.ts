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
    
    return payload
  })
}

export default fp(securityPlugin, { name: 'security' })
