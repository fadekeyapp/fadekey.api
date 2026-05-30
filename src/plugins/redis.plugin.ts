import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'

const redisPlugin: FastifyPluginAsync = (fastify) => {
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  })

  redis.on('error', (err) => fastify.log.error({ err }, 'Redis connection error'))
  redis.on('connect', () => fastify.log.info('Redis connected'))

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })

  return Promise.resolve()
}

export default fp(redisPlugin, { name: 'redis' })
