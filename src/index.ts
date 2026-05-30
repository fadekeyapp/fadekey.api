import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { config } from './config'
import { appCorsPlugin } from './plugins/cors.plugin'
import redisPlugin from './plugins/redis.plugin'
import prismaPlugin from './plugins/prisma.plugin'
import jwtPlugin from './plugins/jwt.plugin'
import securityPlugin from './plugins/security.plugin'
import quotaPlugin from './plugins/quota.plugin'
import itemRoutes from './routes/item.routes'
import authRoutes from './routes/auth.routes'
import apiKeyRoutes from './routes/apikey.routes'
import dashboardRoutes from './routes/dashboard.routes'
import contactRoutes from './routes/contact.routes'
import { runOnboardingJob } from './jobs/onboarding.job'

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
  await app.register(cookie)
  await app.register(redisPlugin)
  await app.register(prismaPlugin)
  await app.register(quotaPlugin)
  await app.register(jwtPlugin)
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
  // CORS behavior is selected dynamically by path in appCorsPlugin.
  await app.register(itemRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(apiKeyRoutes, { prefix: '/api' })
  await app.register(dashboardRoutes, { prefix: '/api' })
  await app.register(contactRoutes, { prefix: '/api' })

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
  // Do not block startup on Redis here; Railway healthchecks should verify that
  // the HTTP server is up, while ioredis keeps retrying in the background.
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

  // ── Onboarding email job ─────────────────────────────────────────────────
  // Run once at startup (catches any missed emails), then every hour.
  const jobDeps = { prisma: app.prisma, log: app.log }
  const runJob = () =>
    runOnboardingJob(jobDeps).catch(err =>
      app.log.error({ err }, 'Onboarding job failed'),
    )

  runJob()
  setInterval(runJob, 60 * 60 * 1000) // every hour
}

void bootstrap()
