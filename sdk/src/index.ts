/**
 * @fadekey/sdk — Official SDK for FadeKey
 *
 * Zero-knowledge, self-destructing encrypted secrets.
 *
 * @packageDocumentation
 */

// Client
export { FadeKey } from './client.js'
export type {
  FadeKeyConfig,
  CreateSecretOptions,
  CreateSecretResult,
  ReadSecretResult,
  CreateSecretRawResult,
  ReadSecretRawResult,
} from './client.js'

// Crypto helpers
export {
  encrypt,
  decrypt,
  derivePasswordHash,
  toBase64url,
  fromBase64url,
} from './crypto.js'
export type { EncryptResult } from './crypto.js'

// Errors
export {
  FadeKeyError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ExpiredError,
  QuotaExceededError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors.js'
