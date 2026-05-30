import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config'

export interface QuotaResult {
  allowed:   boolean
  used:      number
  limit:     number
  remaining: number
  resetAt:   string
}

declare module 'fastify' {
  interface FastifyInstance {
    quota: {
      checkAndIncrement(userId: string, plan: string): Promise<QuotaResult>
      getUsage(userId: string): Promise<{
        used: number
        limit: number
        month: string
      }>
    }
  }
}

function monthKey(userId: string): string {
  const now  = new Date()
  const yyyy = now.getUTCFullYear()
  const mm   = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `quota:monthly:${userId}:${yyyy}-${mm}`
}

function nextMonthISO(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

function planLimit(plan: string): number {
  if (plan === 'pro' || plan === 'enterprise') return config.limits.proMonthlyItems
  return config.limits.freeMonthlyItems
}

const quotaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('quota', {
    async checkAndIncrement(userId: string, plan: string): Promise<QuotaResult> {
      const key   = monthKey(userId)
      const limit = planLimit(plan)

      const used = await fastify.redis.incr(key)

      if (used === 1) {
        await fastify.redis.expire(key, 60 * 60 * 24 * 35)
      }

      const allowed   = used <= limit
      const remaining = Math.max(0, limit - used)

      if (allowed) {
        return { allowed, used, limit, remaining, resetAt: nextMonthISO() }
      }

      await fastify.redis.decr(key)

      return {
        allowed: false,
        used: limit,
        limit,
        remaining: 0,
        resetAt: nextMonthISO(),
      }
    },

    async getUsage(userId: string): Promise<{
      used: number
      limit: number
      month: string
    }> {
      const key   = monthKey(userId)
      const raw   = await fastify.redis.get(key)
      const now   = new Date()
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      })
      const limit = planLimit(user?.plan ?? 'free')

      return {
        used: raw ? parseInt(raw, 10) : 0,
        limit,
        month,
      }
    },
  })
}

export default fp(quotaPlugin, { name: 'quota' })
