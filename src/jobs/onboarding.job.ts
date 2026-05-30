/**
 * Onboarding email job
 *
 * Roda a cada hora. Para cada usuário verificado, verifica quais emails
 * da sequência ainda não foram enviados e se a condição de envio é verdadeira.
 *
 * Sequência:
 *   welcome       → logo após emailVerifiedAt (máx. 1h de atraso pelo job)
 *   day2_nudge    → 2 dias após registro, se não tem nenhum AuditLog de create
 *   day7_api      → 7 dias após registro, se não tem nenhuma ApiKey
 *   day14_upgrade → 14 dias após registro, se plano ainda é free
 *
 * Segurança:
 *   - @@unique([userId, type]) na tabela email_events garante idempotência
 *   - O job usa upsert/createOrSkip pattern para evitar duplicatas mesmo se
 *     rodar duas vezes no mesmo intervalo
 */

import { sendEmail, type EmailType } from '../services/email.service'
import type { PrismaClient }         from '@prisma/client'

const DAY = 24 * 60 * 60 * 1000

interface JobDeps {
  prisma: PrismaClient
  log: { info: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void }
}

export async function runOnboardingJob({ prisma, log }: JobDeps): Promise<void> {
  const now = new Date()

  // Fetch all verified users who haven't received all 4 emails yet
  const users = await prisma.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      createdAt: { lte: new Date(now.getTime() - 1 * 60 * 60 * 1000) }, // at least 1h old
    },
    select: {
      id:              true,
      email:           true,
      plan:            true,
      createdAt:       true,
      emailVerifiedAt: true,
      _count: {
        select: {
          apiKeys:   { where: { revokedAt: null } },
          auditLogs: { where: { action: 'create' } },
        },
      },
    },
  })

  const emailEvents = users.length > 0
    ? await prisma.emailEvent.findMany({
        where: { userId: { in: users.map(user => user.id) } },
        select: { userId: true, type: true },
      })
    : []

  const sentTypesByUserId = new Map<string, Set<EmailType>>()

  for (const event of emailEvents) {
    const sentTypes = sentTypesByUserId.get(event.userId) ?? new Set<EmailType>()
    sentTypes.add(event.type as EmailType)
    sentTypesByUserId.set(event.userId, sentTypes)
  }

  let sent = 0
  let skipped = 0

  for (const user of users) {
    const sentTypes = sentTypesByUserId.get(user.id) ?? new Set<EmailType>()
    const ageMs = now.getTime() - user.createdAt.getTime()
    const hasCreatedSecret = user._count.auditLogs > 0
    const hasApiKey        = user._count.apiKeys > 0

    const candidates: { type: EmailType; condition: boolean }[] = [
      {
        type:      'welcome',
        condition: !sentTypes.has('welcome'),
      },
      {
        type:      'day2_nudge',
        condition: !sentTypes.has('day2_nudge') && ageMs >= 2 * DAY && !hasCreatedSecret,
      },
      {
        type:      'day7_api',
        condition: !sentTypes.has('day7_api') && ageMs >= 7 * DAY && !hasApiKey,
      },

    ]

    for (const { type, condition } of candidates) {
      if (!condition) { skipped++; continue }

      try {
        // Attempt to record the send first — unique constraint prevents duplicates
        await prisma.emailEvent.create({ data: { userId: user.id, type } })
        await sendEmail(user.email, type)
        log.info(`[onboarding] Sent ${type} to ${user.email}`)
        sent++
      } catch (err: any) {
        // P2002 = unique constraint violation — already sent, that's fine
        if (err?.code === 'P2002') {
          skipped++
          continue
        }
        log.error(`[onboarding] Failed to send ${type} to ${user.email}: ${err?.message}`)
        // Roll back the event record so it will retry next run
        await prisma.emailEvent
          .delete({ where: { userId_type: { userId: user.id, type } } })
          .catch(() => null)
      }
    }
  }

  log.info(`[onboarding] Job complete — sent: ${sent}, skipped: ${skipped}, users: ${users.length}`)
}
