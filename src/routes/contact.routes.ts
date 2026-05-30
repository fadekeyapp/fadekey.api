/**
 * Contact routes
 *
 *   POST /api/contact  — submit a contact form message (auth required)
 *
 * The destination address lives only in CONTACT_EMAIL (server-side env).
 * It is never exposed to the client or logged in plaintext.
 */

import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config'

const contactSchema = z.object({
  name:    z.string().min(2).max(80).trim(),
  email:   z.string().email().max(120).trim(),
  type:    z.enum(['limits', 'support', 'billing', 'partnership', 'other']),
  subject: z.string().min(2).max(120).trim(),
  message: z.string().min(10).max(4000).trim(),
})

const contactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/contact', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      const body = contactSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten().fieldErrors })
      }

      if (!config.contact.toEmail) {
        fastify.log.error(
          'CONTACT_EMAIL is not set in environment — add it to apps/api/.env'
        )
        return reply.status(503).send({ error: 'Missing env: CONTACT_EMAIL is not set on the server.' })
      }

      if (!config.email.apiKey) {
        fastify.log.error(
          'RESEND_API_KEY is not set in environment — add it to apps/api/.env'
        )
        return reply.status(503).send({ error: 'Missing env: RESEND_API_KEY is not set on the server.' })
      }

      // Resolve sender identity from JWT
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { email: true, plan: true },
      })

      const senderEmail = user?.email ?? 'unknown'
      const senderPlan  = user?.plan  ?? 'unknown'

      const { name, email: replyEmail, type, subject, message } = body.data

      const emailBody = [
        `From:       ${replyEmail} (${name})`,
        `Account:    ${senderEmail}`,
        `Plan:       ${senderPlan}`,
        `User ID:    ${request.user.sub}`,
        `Type:       ${type}`,
        '',
        '─────────────────────────────────────',
        '',
        message,
        '',
        '─────────────────────────────────────',
        'Sent via FadeKey contact form',
      ].join('\n')

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:     config.email.from,
          to:       [config.contact.toEmail],
          reply_to: replyEmail,
          subject:  `[FadeKey / ${type}] ${subject}`,
          text:     emailBody,
        }),
      })

      if (!response.ok) {
        const err = await response.text().catch(() => '')
        fastify.log.error({ status: response.status, err }, 'Resend error on contact form')
        return reply.status(502).send({ error: 'Failed to send message. Please try again.' })
      }

      fastify.log.info({ userId: request.user.sub }, 'Contact form submitted')
      return reply.status(200).send({ ok: true })
    },
  })
}

export default contactRoutes
