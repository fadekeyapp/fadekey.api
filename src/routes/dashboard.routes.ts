import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /api/dashboard/stats ────────────────────────────────────────────────
  fastify.get('/dashboard/stats', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.sub

      const [totalItems, activeKeys, recentLogs, user, quota] = await Promise.all([
        fastify.prisma.auditLog.count({ where: { userId } }),
        fastify.prisma.apiKey.count({ where: { userId, revokedAt: null } }),
        fastify.prisma.auditLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, action: true, itemId: true, createdAt: true, meta: true },
        }),
        fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { plan: true },
        }),
        fastify.quota.getUsage(userId),
      ])

      return reply.send({
        totalItems,
        activeKeys,
        recentLogs,
        plan: user?.plan ?? 'free',
        quota,
      })
    },
  })

  // ── GET /api/dashboard/audit ────────────────────────────────────────────────
  fastify.get('/dashboard/audit', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .safeParse(request.query)

      if (!query.success) {
        return reply.status(400).send({ error: query.error.flatten().fieldErrors })
      }

      const { page, limit } = query.data
      const skip = (page - 1) * limit

      const [logs, total] = await Promise.all([
        fastify.prisma.auditLog.findMany({
          where: { userId: request.user.sub },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            action: true,
            itemId: true,
            createdAt: true,
            meta: true,
          },
        }),
        fastify.prisma.auditLog.count({ where: { userId: request.user.sub } }),
      ])

      return reply.send({
        data: logs,
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    },
  })
}

export default dashboardRoutes
