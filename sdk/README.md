# @fadekey/sdk

> Official SDK for [FadeKey](https://fadekey.app) — zero-knowledge, self-destructing encrypted secrets.

## Install

```bash
npm install @fadekey/sdk
```

## Quick Start

```ts
import { FadeKey } from '@fadekey/sdk'

const client = new FadeKey({ apiKey: process.env.FADEKEY_API_KEY })

// Create a self-destructing secret
const secret = await client.create('super-secret-password', {
  ttl: 3600,     // 1 hour
  maxViews: 1,   // self-destructs after first view
})

console.log(secret.url)
// → https://fadekey.app/s/abc-123#base64url-encryption-key

// Read and decrypt a secret
const { content, destroyed } = await client.read(secret.id, secret.key)
console.log(content) // → "super-secret-password"
```

## Features

- **Zero-knowledge encryption** — AES-256-GCM client-side encryption. The server never sees the plaintext.
- **Zero runtime dependencies** — uses `globalThis.fetch` and `globalThis.crypto.subtle`.
- **Isomorphic** — works in Node.js >= 18, browsers, Deno, and edge runtimes.
- **Dual format** — ships ESM and CommonJS.
- **Typed errors** — catch specific error types like `QuotaExceededError`, `NotFoundError`, etc.

## API Reference

### `new FadeKey(config?)`

| Option       | Type     | Default                     | Description                           |
|-------------|----------|-----------------------------|---------------------------------------|
| `apiKey`    | `string` | —                           | API key (e.g. `fk_live_xxx`)          |
| `apiBaseUrl`| `string` | `https://api.fadekey.app`   | Base URL of the API                   |
| `appUrl`    | `string` | `https://fadekey.app`       | Base URL for building secret URLs     |
| `bearerToken`| `string` | —                          | JWT bearer token for auth             |

### `client.create(plaintext, options?)`

Create a secret with client-side encryption.

**Options:**

| Option     | Type     | Default | Description                          |
|-----------|----------|---------|--------------------------------------|
| `ttl`     | `number` | `3600`  | Time-to-live in seconds              |
| `maxViews`| `number` | `1`     | Views before self-destruct           |
| `password`| `string` | —       | Optional password protection         |

**Returns:** `{ id, expiresAt, key, url, effectiveTtl, effectiveMaxViews }`

### `client.read(id, key, password?)`

Read and decrypt a secret.

**Returns:** `{ content, destroyed, views, maxViews }`

### Crypto Helpers

If you need low-level access to the encryption primitives:

```ts
import { encrypt, decrypt, derivePasswordHash, toBase64url, fromBase64url } from '@fadekey/sdk'

const { ciphertext, iv, key } = await encrypt('my secret')
const plaintext = await decrypt(ciphertext, iv, key)
const hash = await derivePasswordHash('password123')
```

### Error Handling

```ts
import { FadeKey, NotFoundError, QuotaExceededError } from '@fadekey/sdk'

const client = new FadeKey({ apiKey: 'fk_live_xxx' })

try {
  await client.read('invalid-id', 'key')
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('Secret not found or expired')
  } else if (err instanceof QuotaExceededError) {
    console.log(`Quota: ${err.quota?.used}/${err.quota?.limit}`)
  }
}
```

## Requirements

- **Node.js >= 18** (for `globalThis.fetch` and `crypto.subtle`)
- **Modern browsers** (Chrome 63+, Firefox 65+, Safari 11.1+, Edge 79+)

## License

- MIT — see [LICENSE](../LICENSE).
