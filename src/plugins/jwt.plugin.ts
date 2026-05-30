import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../config'

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessExpiresIn },
  })

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()

        // Enforce account state from DB on each authenticated request.
        const user = request.user
        const dbUser = await fastify.prisma.user.findUnique({
          where: { id: user.sub },
          select: { twoFactorEnabled: true, emailVerifiedAt: true },
        })

        if (!dbUser?.emailVerifiedAt) {
          return reply.status(403).send({ error: 'Email verification required.' })
        }

        if (!user.twoFactorPassed && dbUser.twoFactorEnabled) {
          return reply.status(403).send({ error: 'Two-factor authentication required.' })
        }
      } catch {
        return reply.status(401).send({ error: 'Unauthorized.' })
      }
    },
  )
}

export default fp(jwtPlugin, { name: 'jwt', dependencies: ['prisma'] })
