/**
 * Cryptographic helpers for FadeKey.
 *
 * Works in both Browser (Web Crypto API) and Node.js >= 18
 * (`globalThis.crypto.subtle` via `node:crypto`).
 *
 * All keys use AES-GCM with 256-bit key length and 96-bit (12-byte) IVs.
 * Password hashing uses PBKDF2 with SHA-256, a fixed salt of 'fadekey',
 * and 100 000 iterations — matching the exact parameters used by the
 * FadeKey web frontend.
 */

// ─── Base64url helpers ──────────────────────────────────────────────────────────

/**
 * Encode an ArrayBuffer or ArrayBufferView to a base64url string
 * (no padding, URL-safe alphabet).
 */
export function toBase64url(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(
          (buf as ArrayBufferView).buffer,
          (buf as ArrayBufferView).byteOffset,
          (buf as ArrayBufferView).byteLength,
        )

  // Use btoa where available (browser + Node 16+), otherwise Buffer
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  // Node.js fallback (shouldn't be needed for Node >= 16)
  return Buffer.from(bytes).toString('base64url')
}

/**
 * Decode a base64url string back into a Uint8Array.
 */
export function fromBase64url(str: string): Uint8Array {
  // Convert base64url → standard base64 with correct padding
  const base64 =
    str.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (str.length % 4)) % 4)

  if (typeof atob === 'function') {
    const bin = atob(base64)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  }

  // Node.js fallback
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

// ─── Crypto runtime detection ───────────────────────────────────────────────────

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error(
      'Web Crypto API not available. Ensure you are running Node.js >= 18 or a modern browser.',
    )
  }
  return subtle
}

function getRandomValues(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

// ─── AES-GCM encrypt / decrypt ─────────────────────────────────────────────────

export interface EncryptResult {
  /** Base64url-encoded ciphertext (includes GCM auth tag). */
  ciphertext: string
  /** Base64url-encoded 12-byte IV. */
  iv: string
  /** Base64url-encoded 256-bit AES key — keep this secret. */
  key: string
}

/**
 * Encrypt plaintext using AES-256-GCM with a freshly generated key and IV.
 *
 * The returned `key` is the raw AES key encoded as base64url. It should be
 * stored in the URL fragment (`#key`) so that it never reaches the server.
 */
export async function encrypt(plaintext: string): Promise<EncryptResult> {
  const subtle = getSubtle()
  const enc = new TextEncoder()

  // Generate a fresh AES-256-GCM key
  const cryptoKey = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — we need to export the raw key
    ['encrypt', 'decrypt'],
  )

  // 12-byte (96-bit) IV — standard for AES-GCM
  const rawIv = getRandomValues(12)

  const ciphertextBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: rawIv as ArrayBufferView<ArrayBuffer> },
    cryptoKey,
    enc.encode(plaintext),
  )

  const rawKey = await subtle.exportKey('raw', cryptoKey)

  return {
    ciphertext: toBase64url(ciphertextBuf),
    iv: toBase64url(rawIv),
    key: toBase64url(rawKey),
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * All three parameters should be base64url-encoded strings as returned by
 * `encrypt()` or stored in the API / URL fragment.
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  keyBase64url: string,
): Promise<string> {
  const subtle = getSubtle()

  const keyBytes = fromBase64url(keyBase64url)
  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )

  const ctBytes = fromBase64url(ciphertext)
  const ivBytes = fromBase64url(iv)

  const plainBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as ArrayBufferView<ArrayBuffer> },
    cryptoKey,
    ctBytes as ArrayBufferView<ArrayBuffer>,
  )

  return new TextDecoder().decode(plainBuf)
}

// ─── PBKDF2 password hashing ───────────────────────────────────────────────────

/**
 * Derive a base64url-encoded hash from a password using PBKDF2.
 *
 * Parameters are fixed to match the FadeKey web frontend:
 * - Algorithm: PBKDF2
 * - Hash: SHA-256
 * - Salt: `'fadekey'` (UTF-8)
 * - Iterations: 100 000
 * - Output: 256 bits
 *
 * The result is sent to the server as `passwordHash` — the plaintext
 * password is **never** transmitted.
 */
export async function derivePasswordHash(password: string): Promise<string> {
  const subtle = getSubtle()
  const enc = new TextEncoder()

  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode('fadekey'),
      iterations: 100_000,
    },
    keyMaterial,
    256,
  )

  return toBase64url(bits)
}
