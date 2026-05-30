# FadeKey

> Zero-knowledge, self-destructing encrypted secrets.

Share passwords, tokens, and sensitive messages with end-to-end encryption. Every secret is destroyed after reading — the server never sees your plaintext, ever.

## How it works

```
Browser                          Server
──────────────────────────────   ─────────────────────────────
plaintext
  │
  ▼ AES-GCM encrypt (Web Crypto)
ciphertext + key
  │                   ciphertext ──────────────────► Redis
  │                   (POST /api/items)              (TTL + view limit)
  │
  └─ key stays in URL fragment (#key=...)
     ─────────────────────────────────────────────► never sent in HTTP
                                                     never in server logs

Recipient opens  /s/{id}#{key}
  │
  └─ Browser fetches ciphertext from API
  └─ Decrypts locally with #key
  └─ Server destroys ciphertext on final view
```

The key lives in the [URL fragment](https://developer.mozilla.org/en-US/docs/Web/API/URL/hash). Browsers only use it locally — it is never included in HTTP requests, server logs, or `Referer` headers.

## Monorepo structure

```
fadekey/
├── apps/
│   ├── api/          Fastify REST API — standalone, self-hostable
│   └── web/          Nuxt 4 SSR + PWA frontend
├── .env.example      Root environment variables (for Docker / Render)
├── .gitignore
├── docker-compose.yml
├── Makefile
├── package.json      npm workspaces root
└── render.yaml       Render.com one-click deploy
```

## Quick start

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env — set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to 64-byte random hex

make docker-up
```

- Frontend → http://localhost:3000  
- API      → http://localhost:3001

### Local development

```bash
npm install          # installs all workspaces

# In separate terminals:
make dev-api         # Fastify + tsx watch on :3001
make dev-web         # Nuxt dev server on :3000
```

Or both at once:

```bash
make dev
```

### Database

```bash
make db-migrate      # run Prisma migrations
make db-studio       # open Prisma Studio
```

## Packages

| Package    | Description                                    | Docs                          |
|------------|------------------------------------------------|-------------------------------|
| `apps/api` | Fastify 4 · PostgreSQL · Redis · Prisma ORM    | [README](apps/api/README.md)  |
| `apps/web` | Nuxt 4 · SSR · PWA · i18n (en, pt-BR, es)     | [README](apps/web/README.md)  |

## Self-hosting

The API (`apps/api`) is fully standalone — it only requires PostgreSQL and Redis and ships with its own Dockerfile. Deploy it anywhere without the frontend if you only need the API.

See [apps/api/README.md](apps/api/README.md) for configuration details.

## Internationalization

| Code    | Language            |
|---------|---------------------|
| `en`    | English (default)   |
| `pt-BR` | Português (Brasil)  |
| `es`    | Español             |

Translations live in `apps/web/i18n/locales/`. Pull requests for additional locales are welcome.

## Contributing

1. Fork the repository  
2. Create a feature branch: `git checkout -b feat/your-feature`  
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/)  
4. Open a pull request

Please keep all code, comments, and documentation in **English**.

## License

MIT — see [LICENSE](LICENSE).
