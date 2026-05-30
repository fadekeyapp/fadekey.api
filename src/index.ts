import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { config } from './config'
import { appCorsPlugin } from './plugins/cors.plugin'
import redisPlugin from './plugins/redis.plugin'
import securityPlugin from './plugins/security.plugin'
import itemRoutes from './routes/item.routes'

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport:
        config.env !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    bodyLimit: config.limits.maxPayloadBytes * 2,
    trustProxy: true,
  })

  // ── Core plugins ─────────────────────────────────────────────────────────────
  await app.register(securityPlugin)
  await app.register(redisPlugin)
  await app.register(appCorsPlugin)

  // ── Global rate limiting ─────────────────────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({
      error: 'Too many requests. Please try again in a moment.',
      retryAfter: 60,
    }),
  })

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(itemRoutes, { prefix: '/api' })

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', () => ({
    status: 'ok',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  }))

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Route not found.' })
  })

  app.setErrorHandler((error: any, _req, reply) => {
    app.log.error(error)
    const statusCode = error.statusCode ?? 500
    const isServerError = statusCode >= 500

    if (config.env !== 'production') {
      return reply.status(statusCode).send({
        statusCode,
        code: error.name,
        error: isServerError ? 'Internal Server Error' : 'Request Error',
        message: error.message,
        stack: error.stack,
      })
    }

    return reply.status(statusCode).send({
      statusCode,
      error: isServerError ? 'Internal Server Error' : 'Request Error',
      message: isServerError ? 'Internal error.' : error.message || 'Request error.',
    })
  })

  // ── Redis readiness ─────────────────────────────────────────────────────────
  app.redis.ping()
    .then(() => app.log.info('Redis ping OK'))
    .catch((err) => app.log.error({ err }, 'Redis unreachable on startup'))

  try {
    await app.listen({ port: config.port, host: config.host })
    app.log.info(`FadeKey API v0.2 ready at http://${config.host}:${config.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void bootstrap()
