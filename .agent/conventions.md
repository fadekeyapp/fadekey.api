# FadeKey — Code Conventions

> These are patterns the codebase already follows consistently.
> Match them exactly when adding new code.

---

## API routes

### File naming
`src/routes/{domain}.routes.ts` — one file per domain noun.
Existing: `auth`, `item`, `apikey`, `dashboard`, `contact`.

### Registration pattern
```ts
// index.ts
import fooRoutes from './routes/foo.routes'
await app.register(fooRoutes, { prefix: '/api' })
```

### Route structure
```ts
const fooRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/foo/:id', {
    preHandler: [fastify.authenticate],   // if auth required
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      // 1. Validate input with Zod
      // 2. Auth/permission check
      // 3. Business logic
      // 4. Return shaped response
    },
  })
}
export default fooRoutes
```

### Zod validation
Always `schema.safeParse(request.body)`, never `.parse()`.
On failure: `reply.status(400).send({ error: body.error.flatten().fieldErrors })`.

### Error responses
```ts
// 400 Bad input
reply.status(400).send({ error: 'Human-readable message.' })
// 401 Not authenticated
reply.status(401).send({ error: 'Invalid or revoked API key.' })
// 403 Authenticated but forbidden
reply.status(403).send({ error: 'Insufficient permissions.' })
// 404 Not found
reply.status(404).send({ error: 'Resource not found.' })
// 409 Conflict
reply.status(409).send({ error: 'Already exists.' })
// 429 Rate/quota limit
reply.status(429).send({ error: 'Limit exceeded.', quota: { ... } })
// 503 Config missing
reply.status(503).send({ error: 'Missing env: VARIABLE_NAME is not set.' })
```

---

## Git conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(quota): add custom limits config
fix(quota): rollback counter on rejected request
docs(api): update limits table
chore(deps): bump prisma to 5.22.0
```

Branch naming: `feat/description`, `fix/description`, `chore/description`.

---

## Prisma migrations

1. Edit `prisma/schema.prisma`
2. `npx prisma migrate dev --name describe_the_change`
3. Commit both `schema.prisma` and the generated migration SQL
4. Never edit migration SQL files after they have been applied to any environment

---

## Adding a new email type

1. Add type to `EmailType` union in `email.service.ts`
2. Add template factory function `{type}Template(appUrl: string)`
3. Add to `templateMap` in `sendEmail()`
4. If it's part of the onboarding sequence, add condition to `onboarding.job.ts`
5. Add `email_events` entry (if idempotency is needed)
