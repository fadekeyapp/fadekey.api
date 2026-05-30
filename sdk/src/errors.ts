/**
 * Typed error classes for FadeKey API responses.
 *
 * Every error thrown by the SDK is an instance of `FadeKeyError`,
 * so callers can catch the base class or narrow by subclass.
 */

export class FadeKeyError extends Error {
  /** HTTP status code that triggered this error, when applicable. */
  public readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'FadeKeyError'
    this.status = status
  }
}

/** 401 — Invalid or revoked API key / token. */
export class AuthError extends FadeKeyError {
  constructor(message = 'Invalid or revoked API key.') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

/** 403 — Email verification or 2FA required. */
export class ForbiddenError extends FadeKeyError {
  constructor(message = 'Access denied.') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

/** 404 — Secret not found or already expired. */
export class NotFoundError extends FadeKeyError {
  constructor(message = 'Item not found or already expired.') {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}

/** 410 — Secret has been permanently destroyed. */
export class ExpiredError extends FadeKeyError {
  constructor(message = 'Item has expired and been destroyed.') {
    super(message, 410)
    this.name = 'ExpiredError'
  }
}

/** 429 — Monthly quota exceeded for the current plan. */
export class QuotaExceededError extends FadeKeyError {
  public readonly quota?: {
    used: number
    limit: number
    resetAt: string
  }

  constructor(
    message = 'Monthly quota exceeded.',
    quota?: { used: number; limit: number; resetAt: string },
  ) {
    super(message, 429)
    this.name = 'QuotaExceededError'
    this.quota = quota
  }
}

/** 429 — Too many requests (IP / per-key rate limit). */
export class RateLimitError extends FadeKeyError {
  constructor(message = 'Too many requests. Please slow down.') {
    super(message, 429)
    this.name = 'RateLimitError'
  }
}

/** 503 — Service temporarily unavailable. */
export class ServiceUnavailableError extends FadeKeyError {
  constructor(message = 'Service temporarily unavailable.') {
    super(message, 503)
    this.name = 'ServiceUnavailableError'
  }
}
