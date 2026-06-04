/**
 * FadeKey SDK client.
 *
 * Provides a simple, high-level API for creating, reading, and revoking
 * self-destructing secrets via the FadeKey API.
 *
 * @example
 * ```ts
 * import { FadeKey } from '@fadekey/sdk'
 *
 * const client = new FadeKey({ apiKey: process.env.FADEKEY_API_KEY })
 *
 * // Create a secret
 * const secret = await client.create('super-secret-token', {
 *   ttl: 3600,
 *   maxViews: 1,
 * })
 * console.log(secret.url) // https://fadekey.app/s/<id>#<key>
 *
 * // Read a secret
 * const { content } = await client.read(secret.id, secret.key)
 * ```
 */

import { encrypt, decrypt, derivePasswordHash } from './crypto.js'
import {
  FadeKeyError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors.js'

// ─── Public types ───────────────────────────────────────────────────────────────

export interface FadeKeyConfig {
  /** API key for authenticated requests (e.g. `fk_live_xxx`). */
  apiKey?: string

  /**
   * Base URL of the FadeKey API.
   * @default 'https://api.fadekey.app'
   */
  apiBaseUrl?: string

  /**
   * Base URL of the FadeKey web app (used for building secret URLs).
   * @default 'https://fadekey.app'
   */
  appUrl?: string

  /**
   * Bearer token (JWT) for authenticated requests.
   * When set, this takes precedence over `apiKey` for Authorization header.
   */
  bearerToken?: string
}

export interface CreateSecretOptions {
  /** Time-to-live in seconds. @default 3600 */
  ttl?: number

  /** Maximum number of views before the secret self-destructs. @default 1 */
  maxViews?: number

  /** Optional password to protect the secret. */
  password?: string
}

export interface CreateSecretResult {
  /** UUID of the created secret. */
  id: string

  /** ISO 8601 date when the secret will expire. */
  expiresAt: string

  /** The base64url-encoded AES key (lives only on the client). */
  key: string

  /** Full URL including the key fragment, ready to share. */
  url: string

  /** Effective TTL applied by the server (may be capped by plan). */
  effectiveTtl: number

  /** Effective maxViews applied by the server (may be capped by plan). */
  effectiveMaxViews: number | null
}

export interface ReadSecretResult {
  /** Decrypted plaintext content. */
  content: string

  /** Whether the secret was destroyed on this read (final view). */
  destroyed: boolean

  /** Current view count (including this read). */
  views: number

  /** Maximum views allowed, or null if unlimited. */
  maxViews: number | null
}

export interface CreateSecretRawResult {
  /** UUID of the created secret. */
  id: string

  /** ISO 8601 date when the secret will expire. */
  expiresAt: string

  /** Effective TTL applied by the server. */
  effectiveTtl: number

  /** Effective maxViews applied by the server. */
  effectiveMaxViews: number | null

  /** Mode: 'production' or 'playground'. */
  mode: string
}

export interface ReadSecretRawResult {
  /** Base64url-encoded ciphertext. */
  ciphertext: string

  /** Base64url-encoded IV. */
  iv: string

  /** Whether this secret requires a password. */
  hasPassword: boolean

  /** Current view count. */
  views: number

  /** Maximum views allowed, or null if unlimited. */
  maxViews: number | null

  /** Whether the secret was destroyed (final view). */
  destroyed: boolean
}

// ─── Client class ───────────────────────────────────────────────────────────────

const DEFAULT_API_BASE = 'https://api.fadekey.app'
const DEFAULT_APP_URL = 'https://fadekey.app'

export class FadeKey {
  private readonly apiKey?: string
  private readonly bearerToken?: string
  private readonly apiBaseUrl: string
  private readonly appUrl: string

  constructor(config?: FadeKeyConfig) {
    this.apiKey = config?.apiKey
    this.bearerToken = config?.bearerToken
    this.apiBaseUrl = (config?.apiBaseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '')
    this.appUrl = (config?.appUrl ?? DEFAULT_APP_URL).replace(/\/+$/, '')
  }

  // ── High-level API ──────────────────────────────────────────────────────────

  /**
   * Create a self-destructing secret.
   *
   * Encrypts the plaintext client-side using AES-256-GCM, sends only the
   * ciphertext to the server, and returns the full URL with the decryption
   * key in the fragment.
   */
  async create(
    plaintext: string,
    options?: CreateSecretOptions,
  ): Promise<CreateSecretResult> {
    const { ciphertext, iv, key } = await encrypt(plaintext)

    const passwordHash =
      options?.password ? await derivePasswordHash(options.password) : undefined

    const body: Record<string, unknown> = {
      ciphertext,
      iv,
      ttl: options?.ttl ?? 3600,
      maxViews: options?.maxViews ?? 1,
    }

    if (passwordHash) {
      body.passwordHash = passwordHash
    }

    const data = await this.createRaw(body)

    return {
      id: data.id,
      expiresAt: data.expiresAt,
      key,
      url: `${this.appUrl}/s/${data.id}#${key}`,
      effectiveTtl: data.effectiveTtl,
      effectiveMaxViews: data.effectiveMaxViews,
    }
  }

  /**
   * Read and decrypt a secret.
   *
   * @param id   — UUID of the secret.
   * @param key  — Base64url-encoded AES key (from the URL fragment).
   * @param password — Optional password if the secret is password-protected.
   */
  async read(
    id: string,
    key: string,
    password?: string,
  ): Promise<ReadSecretResult> {
    const data = await this.readRaw(id, password)

    const content = await decrypt(data.ciphertext, data.iv, key)

    return {
      content,
      destroyed: data.destroyed,
      views: data.views,
      maxViews: data.maxViews,
    }
  }

  /**
   * Revoke (delete) a secret before it expires or is fully read.
   * Requires authentication (API key or Bearer token) and ownership of the secret.
   *
   * @param id — UUID of the secret to revoke.
   */
  async revoke(id: string): Promise<void> {
    await this.fetch(`/api/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  // ── Low-level API (no encryption) ───────────────────────────────────────────

  /**
   * Send a pre-encrypted payload to the API.
   * Useful when the caller manages encryption themselves.
   */
  async createRaw(
    body: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<CreateSecretRawResult> {
    const res = await this.fetch('/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    })

    return res as CreateSecretRawResult
  }

  /**
   * Fetch the raw (still encrypted) secret payload from the API.
   * Useful when the caller manages decryption themselves.
   */
  async readRaw(
    id: string,
    password?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ReadSecretRawResult> {
    const headers: Record<string, string> = { ...extraHeaders }

    if (password) {
      headers['X-Password-Hash'] = await derivePasswordHash(password)
    }

    const res = await this.fetch(`/api/items/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
    })

    return res as ReadSecretRawResult
  }

  // ── Internal HTTP layer ─────────────────────────────────────────────────────

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`
    } else if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    return headers
  }

  private async fetch(
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    const url = `${this.apiBaseUrl}${path}`

    const headers = {
      ...this.buildAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    }

    const res = await globalThis.fetch(url, {
      ...init,
      headers,
    })

    if (res.ok) {
      if (res.status === 204) {
        return
      }
      return res.json()
    }

    // Parse error body
    const errorData = await res.json().catch(() => ({})) as Record<string, unknown>
    const message =
      typeof errorData.error === 'string'
        ? errorData.error
        : `HTTP ${res.status}`

    switch (res.status) {
      case 401:
        throw new AuthError(message)
      case 403:
        throw new ForbiddenError(message)
      case 404:
        throw new NotFoundError(message)
      case 429: {
        // Distinguish quota exceeded (has quota object) from rate limit
        if (errorData.quota) {
          throw new QuotaExceededError(
            message,
            errorData.quota as { used: number; limit: number; resetAt: string },
          )
        }
        throw new RateLimitError(message)
      }
      case 503:
        throw new ServiceUnavailableError(message)
      default:
        throw new FadeKeyError(message, res.status)
    }
  }
}
