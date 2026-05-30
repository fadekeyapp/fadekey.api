# FadeKey API — Agent Context

> Read this file before touching any code. It describes what the project is,
> the conventions it follows, what has been built, and what comes next.

## What is FadeKey?

Zero-knowledge secret sharing API. Users create encrypted secrets with a TTL
and view limit; the server stores only ciphertext. The AES-GCM key lives
exclusively in the client URL fragment (handled by the client UI) — it is never sent to the server, never logged.

**Positioning:** Open-source, self-hostable core API. It provides a REST API that lets developers automate secret sharing from CI/CD pipelines and scripts.

---

## Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| API          | Fastify 5, TypeScript, Prisma, Redis    |
| Database     | PostgreSQL (Prisma ORM)                 |
| Cache/queues | Redis (ioredis) — secrets + quota + jobs|
| Auth         | JWT access token (JS memory) + `fk_refresh` httpOnly cookie. Refresh/logout use `credentials: 'include'`; all other auth calls use `Authorization: Bearer` header. |
| Email        | Resend (`src/services/email.service.ts`) |

---

## Directory layout

```
prisma/schema.prisma        — DB schema
prisma/migrations/          — DB migration history
src/
  config.ts                 — env variables config
  index.ts                  — bootstrap & server entry point
  plugins/                  — fastify-plugins (prisma, redis, jwt, quota)
  routes/                   — fastify route handlers
  services/email.service.ts — Resend transactional mail service
  jobs/onboarding.job.ts    — onboarding email sequence
```

---

## Critical conventions — follow exactly

### API
- All env vars must go through `src/config.ts`. Never call `process.env` directly.
- Auth: access token is passed in `Authorization: Bearer` header. Refresh token is in `fk_refresh` httpOnly cookie.
- Rate limit every route via `config: { rateLimit: { max, timeWindow } }`.
- Quota is enforced in `POST /api/items` via `fastify.quota.checkAndIncrement()`.
- All email sending goes through `sendEmail(to, type)` in `email.service.ts`.

### Database
- Run `npx prisma migrate dev --name description` for schema changes.
- Commit both the migration SQL and the updated `schema.prisma`.
- All models must have `@@map("snake_case_table_name")`.

---

## Environment variables

See `.env.example` for the full list. Minimum to boot locally:

```
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
RESEND_API_KEY
CONTACT_EMAIL
```
