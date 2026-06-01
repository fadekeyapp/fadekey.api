# FadeKey API

> Stateless, Redis-backed zero-knowledge sharing engine. Ideal for CI/CD pipelines, DevOps, and automation.

This is the open-source backend for **FadeKey**, a secure tool to share passwords, tokens, and sensitive messages with end-to-end encryption. 

If you want to self-host the server, Docker Compose is the recommended way to run it locally or in your own infrastructure. The API is also published on npm as [fadekey-api](https://www.npmjs.com/package/fadekey-api) for teams that prefer npm-based deployments.

The API is fully stateless, extremely lightweight, and requires **only Redis** (no SQL databases, no migrations).

Looking for the client library? Check out the official [@fadekey/sdk](https://www.npmjs.com/package/@fadekey/sdk) on npm. It handles client-side encryption (AES-GCM), password hashing, and API requests automatically in Node.js and browsers.

---

## How it Works

```
Client (Browser/CLI)                   API Server (Fastify)
─────────────────────                  ────────────────────
plaintext
  │
  ▼ AES-GCM encrypt (Client-side)
ciphertext + key
  │                        ciphertext ──────────────────► Redis
  │                        (POST /api/items)              (TTL + view limit)
  │
  └─ key stays in URL fragment (#key=...)
     ───────────────────────────────────────────────────► never sent in HTTP
                                                          never in server logs

Recipient opens link with #{key}
  │
  └─ Client fetches ciphertext from API (GET /api/items/:id)
  └─ Decrypts locally using the fragment #key
  └─ Server deletes the ciphertext from Redis on final view
```

The decryption key lives in the URL fragment (e.g. `https://fadekey.app/s/uuid#key`). Browsers only process the fragment locally — it is never included in HTTP requests, server logs, or `Referer` headers. The server never sees the decryption key or plaintext.

---

## Features

- **Zero-Knowledge**: Client-side AES-GCM encryption. The server only stores encrypted binary blobs.
- **Stateless & Database-Free**: No PostgreSQL, no Prisma, no migrations. Everything is managed in Redis with TTLs (Time-to-Live).
- **Self-Destructing**: Secrets are deleted automatically after a configurable number of views (`maxViews`) or when the TTL expires.
- **Password Protection**: Optional client-side PBKDF2-derived password check for extra security.
- **Playground Mode**: Integrated daily quotas for documentation testing.

---

## Quick Start

### 1. Docker Compose (Recommended)

To run the API and a Redis instance locally using Docker:

```bash
docker compose up -d
```

This starts:
*   The API server at `http://localhost:3002`
*   Redis at `localhost:6380`

---

### 2. Local Development

Ensure you have Node.js 20+ and Redis running.

```bash
# Clone the repository
git clone https://github.com/fadekey-app/fadekey.api.git
cd fadekey.api

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Customize .env if your Redis is running on a different port/host

# Start development server
npm run dev
```

The server will start at `http://localhost:3002` (or the `PORT` specified in your `.env`).

---

## API Endpoints

### 1. Store a Secret
`POST /api/items`

**Request Body:**
```json
{
  "ciphertext": "encrypted-base64url-payload",
  "iv": "16-character-base64url-iv",
  "ttl": 3600,
  "maxViews": 1,
  "passwordHash": "optional-client-derived-pbkdf2-hash"
}
```

**Response (201 Created):**
```json
{
  "id": "e305e921-6cb3-4876-bde3-f111bd0175b3",
  "expiresAt": "2026-05-30T14:11:24.067Z",
  "effectiveTtl": 3600,
  "effectiveMaxViews": 1,
  "mode": "production"
}
```

---

### 2. Retrieve a Secret
`GET /api/items/:id`

If the secret is password-protected, you must send the derived password hash via the `X-Password-Hash` header or in the request body.

**Response (200 OK):**
```json
{
  "ciphertext": "encrypted-base64url-payload",
  "iv": "16-character-base64url-iv",
  "hasPassword": false,
  "views": 1,
  "maxViews": 1,
  "destroyed": true
}
```
*(Once `destroyed` is true, the item is deleted from Redis immediately).*

---

### 3. Health Check
`GET /health`

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "0.2.0",
  "timestamp": "2026-05-30T13:05:35.256Z"
}
```

---

## Use Cases & CLI Examples

### 1. Share Secrets via CLI (DevOps / Scripts)
Since the API is stateless and doesn't require session state, you can easily integrate it into your deployment pipelines (GitHub Actions, GitLab CI) or local automation scripts using `curl`:

**Store a secret from your terminal:**
```bash
curl -X POST http://localhost:3002/api/items \
  -H "Content-Type: application/json" \
  -d '{
    "ciphertext": "eG1hcy1zZWNyZXQtaGVyZQ",
    "iv": "YWJjZGVmZ2hpamtsbW5vcA",
    "ttl": 300,
    "maxViews": 1
  }'
```

**Retrieve and destroy the secret:**
```bash
# Getting it once deletes it from Redis immediately
curl -X GET http://localhost:3002/api/items/YOUR_SECRET_UUID
```

### 2. DevOps & Automation Examples
*   **Secure Key Passing**: Securely pass temporary access tokens or configuration parameters between decoupled tasks in a pipeline without writing them to persistent system logs.
*   **Ephemeral Developer Access**: Generate one-time-use tokens for developer debugging sessions that expire automatically in 15 minutes.
*   **ChatOps Integration**: Share credentials securely inside Slack or Discord teams using bot-generated links that disappear after the user opens them.

### 3. Official GitHub Action (`fadekey-app/share-secret`)

For teams building on GitHub Actions, the official [fadekey-app/share-secret](https://github.com/fadekey-app/share-secret) Action makes it easy to share secrets between jobs or post secure retrieval links to Pull Requests without leaving sensitive credentials in your runner logs:

```yaml
- name: Share Ephemeral Secret
  uses: fadekey-app/share-secret@v1
  with:
    api_key: ${{ secrets.FADEKEY_API_KEY }}
    payload: "my-deployment-secret"
    ttl: 600
    create_pr_comment: true
```

---

## Configuration (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3002` | Port to bind the Fastify server. |
| `HOST` | `0.0.0.0` | Host interface. |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`). |
| `REDIS_URL` | `redis://localhost:6380` | Connection string for your Redis database. |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed origins (comma-separated). |
| `MAX_PAYLOAD_SIZE_BYTES` | `102400` | Max size (in bytes) of the encrypted payload (default 100 KB). |

---

## License

MIT — see [LICENSE](LICENSE).
