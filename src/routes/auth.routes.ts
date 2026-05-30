import { z } from 'zod'
import { randomBytes, scrypt, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config'
import { sendEmail } from '../services/email.service'

const scryptAsync = promisify(scrypt)
const verifyTokenTtlMs = 24 * 60 * 60 * 1000


const registerSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must not exceed 128 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[\W_]/, 'Password must contain at least one special character.'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const verifyEmailSchema = z.object({
  token: z.string().min(32),
})

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return derived.toString('hex') === hash
}

function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createVerifyToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('hex')
  return {
    raw,
    hash: hashVerifyToken(raw),
    expiresAt: new Date(Date.now() + verifyTokenTtlMs),
  }
}

async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${config.app.url}/auth/verify-email?token=${encodeURIComponent(token)}`

  const apiKey = config.email.apiKey
  if (!apiKey) {
    throw new Error('Resend API key is not configured (RESEND_API_KEY).')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [email],
      subject: 'Confirme seu e-mail no FadeKey',
      text: [
        'Bem-vindo ao FadeKey.',
        '',
        'Confirme seu e-mail para ativar sua conta:',
        verifyUrl,
        '',
        'Se voce nao criou esta conta, ignore este e-mail.',
      ].join('\n'),
      html: `
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: system-ui, sans-serif; background: #06090f; color: #c8d8e8; margin: 0; padding: 40px 16px; }
            .card { max-width: 480px; margin: 0 auto; background: #0d1320; border: 1px solid #1a2840; border-radius: 16px; padding: 40px 32px; }
            .logo { font-size: 20px; font-weight: 700; color: #00d9ff; margin-bottom: 32px; }
            h1 { font-size: 22px; color: #e8f4ff; margin: 0 0 16px; }
            p { font-size: 14px; line-height: 1.7; color: #8aa0b0; margin: 0 0 24px; }
            .btn { display: inline-block; background: #00d9ff; color: #040810; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
            .footer { margin-top: 32px; font-size: 12px; color: #344050; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">⬡ FadeKey</div>
            <h1>Confirme seu email</h1>
            <p>Clique no botão abaixo para ativar sua conta FadeKey. O link expira em 24 horas.</p>
            <a target="_blank" rel="noopener noreferrer" href="${verifyUrl}" class="btn">Verificar email</a>
            <p style="margin-top:24px">Ou acesse:<br><a target="_blank" rel="noopener noreferrer" href="${verifyUrl}" style="color:#00d9ff;word-break:break-all;">${verifyUrl}</a></p>
            <div class="footer">Se voce nao criou esta conta, ignore este email.</div>
          </div>
        </body>
        </html>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Resend API request failed with status ${response.status}: ${errorText}`)
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /api/auth/register ─────────────────────────────────────────────────
  fastify.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const body = registerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten().fieldErrors })
      }

      const { email, password } = body.data

      const existing = await fastify.prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true },
      })
      if (existing) {
        if (existing.emailVerifiedAt) {
          return reply.status(409).send({ error: 'An account with this email already exists.' })
        }

        const passwordHash = await hashPassword(password)
        const verify = createVerifyToken()

        await fastify.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            emailVerifyHash: verify.hash,
            emailVerifyUntil: verify.expiresAt,
          },
        })

        try {
          await sendVerificationEmail(email, verify.raw)
        } catch (error) {
          request.log.error({ err: error }, 'Failed to send verification email for existing account')
          return reply.status(500).send({ error: 'Could not send verification email. Try again in a moment.' })
        }

        return reply.status(202).send({
          message: 'Account pending verification. Check your inbox to activate access.',
        })
      }

      const passwordHash = await hashPassword(password)
      const verify = createVerifyToken()

      const user = await fastify.prisma.user.create({
        data: {
          email,
          passwordHash,
          plan: 'free',
          emailVerifyHash: verify.hash,
          emailVerifyUntil: verify.expiresAt,
        },
        select: { id: true, email: true },
      })

      try {
        await sendVerificationEmail(email, verify.raw)
      } catch (error) {
        request.log.error({ err: error }, 'Failed to send verification email for new account')
        await fastify.prisma.user.delete({ where: { id: user.id } }).catch(() => null)
        return reply.status(500).send({ error: 'Could not send verification email. Try again in a moment.' })
      }

      return reply.status(201).send({
        message: 'Account created. Please confirm your email before logging in.',
      })
    },
  })

  // ── GET /api/auth/verify-email ─────────────────────────────────────────────
  fastify.get('/auth/verify-email', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const parsed = verifyEmailSchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Verification token is invalid.' })
      }

      const tokenHash = hashVerifyToken(parsed.data.token)

      const user = await fastify.prisma.user.findFirst({
        where: {
          emailVerifyHash: tokenHash,
          emailVerifiedAt: null,
          emailVerifyUntil: { gt: new Date() },
        },
        select: { id: true },
      })

      if (!user) {
        return reply.status(400).send({ error: 'Verification token is invalid or expired.' })
      }

      await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerifyHash: null,
          emailVerifyUntil: null,
        },
      })

      // Fire-and-forget welcome email — don't block the response
      fastify.prisma.emailEvent
        .create({ data: { userId: user.id, type: 'welcome' } })
        .then(async () => {
          const welcomeUser = await fastify.prisma.user.findUnique({
            where: { id: user.id },
            select: { email: true },
          })

          if (!welcomeUser) {
            return
          }

          await sendEmail(welcomeUser.email, 'welcome')
        })
        .catch(err => fastify.log.error({ err }, 'Failed to send welcome email'))

      return reply.send({ message: 'Email confirmed successfully. You can now log in.' })
    },
  })

  // ── POST /api/auth/resend-verification ──────────────────────────────────────
  fastify.post('/auth/resend-verification', {
    config: { rateLimit: { max: 5, timeWindow: '30 minutes' } },
    handler: async (request, reply) => {
      const RequestSchema = z.object({ email: z.string().email() })
      const body = RequestSchema.safeParse(request.body)
      
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid email address.' })
      }
      const { email } = body.data

      const redisKey = `verify_cooldown:${email}`
      const cooldown = await fastify.redis.get(redisKey)

      if (cooldown) {
        return reply.status(429).send({ error: 'Please wait a moment before requesting another email.' })
      }

      const existing = await fastify.prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true },
      })

      // Mask success to avoid email enumeration
      if (!existing || existing.emailVerifiedAt) {
        return reply.send({ message: 'If your account is pending, a new link has been sent.' })
      }

      await fastify.redis.set(redisKey, '1', 'EX', 60) // 60s cooldown

      const verify = createVerifyToken()
      await fastify.prisma.user.update({
        where: { id: existing.id },
        data: {
          emailVerifyHash: verify.hash,
          emailVerifyUntil: verify.expiresAt,
        },
      })

      try {
        await sendVerificationEmail(email, verify.raw)
      } catch (error) {
        request.log.error({ err: error }, 'Failed to resend verification email')
        // Unset cooldown so user can try again
        await fastify.redis.del(redisKey).catch(() => null)
        return reply.status(500).send({ error: 'Could not send verification email. Try again in a moment.' })
      }

      return reply.send({ message: 'If your account is pending, a new link has been sent.' })
    },
  })

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request, reply) => {
      const body = loginSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten().fieldErrors })
      }

      const { email, password } = body.data

      const user = await fastify.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          plan: true,
          passwordHash: true,
          twoFactorEnabled: true,
          emailVerifiedAt: true,
        },
      })

      // Constant-time-ish: always hash even when user is not found
      const passwordMatches = user
        ? await verifyPassword(password, user.passwordHash)
        : await verifyPassword(password, 'dummy:00000000000000000000000000000000')

      if (!user || !passwordMatches) {
        return reply.status(401).send({ error: 'Invalid email or password.' })
      }

      if (!user.emailVerifiedAt) {
        return reply.status(403).send({ error: 'Please confirm your email before logging in.' })
      }

      const accessToken = fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        plan: user.plan,
        twoFactorPassed: false,
      })

      const refreshToken = randomBytes(40).toString('hex')
      const refreshExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

      await fastify.prisma.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt: refreshExpiry },
      })

      reply.setCookie('fk_refresh', refreshToken, {
        httpOnly: true,
        secure: config.env === 'production' || String(config.app.url).startsWith('https://'),
        sameSite: 'lax',
        path: '/api/auth',
        expires: refreshExpiry,
      })

      return reply.send({
        accessToken,
        user: { id: user.id, email: user.email, plan: user.plan },
      })
    },
  })

  // ── POST /api/auth/refresh ──────────────────────────────────────────────────
  fastify.post('/auth/refresh', {
    handler: async (request, reply) => {
      // Only accept refresh tokens from the httpOnly cookie to preserve the
      // security boundary provided by the cookie. Do not accept tokens from
      // the request body.
      const token = request.cookies?.fk_refresh

      if (!token) {
        return reply.status(401).send({ error: 'No refresh token provided.' })
      }

      const stored = await fastify.prisma.refreshToken.findUnique({
        where: { token },
        include: { user: { select: { id: true, email: true, plan: true, emailVerifiedAt: true } } },
      })

      if (!stored || stored.expiresAt < new Date() || stored.revokedAt || !stored.user.emailVerifiedAt) {
        return reply.status(401).send({ error: 'Refresh token invalid or expired.' })
      }

      // Rotate refresh token
      await fastify.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      })

      const newRefreshToken = randomBytes(40).toString('hex')
      const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

      await fastify.prisma.refreshToken.create({
        data: { token: newRefreshToken, userId: stored.userId, expiresAt: newExpiry },
      })

      const accessToken = fastify.jwt.sign({
        sub: stored.user.id,
        email: stored.user.email,
        plan: stored.user.plan,
        twoFactorPassed: false,
      })

      reply.setCookie('fk_refresh', newRefreshToken, {
        httpOnly: true,
        secure: config.env === 'production' || String(config.app.url).startsWith('https://'),
        sameSite: 'lax',
        path: '/api/auth',
        expires: newExpiry,
      })

      return reply.send({ accessToken })
    },
  })

  // ── POST /api/auth/logout ───────────────────────────────────────────────────
  fastify.post('/auth/logout', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const token = request.cookies?.fk_refresh
      if (token) {
        await fastify.prisma.refreshToken
          .updateMany({
            where: { token, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          .catch(() => null) // Non-fatal
      }

      reply.clearCookie('fk_refresh', { path: '/api/auth' })
      return reply.status(204).send()
    },
  })
}

export default authRoutes
