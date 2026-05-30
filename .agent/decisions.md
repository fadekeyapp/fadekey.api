# Architecture Decision Records

> Each entry explains a non-obvious choice and the reasoning behind it.
> Before changing something listed here, add a new entry explaining why.

---

## ADR-001 — JWT in memory, refresh token in httpOnly cookie

**Decision:** Access tokens are stored in memory on the client. Refresh tokens are in `fk_refresh` httpOnly cookie.

**Why:** Local storage is readable by any XSS payload. httpOnly cookies are immune to XSS but vulnerable to CSRF — refresh tokens are acceptable here because the refresh endpoint itself sets `sameSite: 'lax'` and requires the old refresh token, making CSRF attacks impractical.

**Auth pattern by call type:**
- `POST /api/auth/refresh` and `POST /api/auth/logout` — use `credentials: 'include'` so the browser sends the `fk_refresh` httpOnly cookie automatically.
- All other authenticated calls (items, dashboard, keys…) — use `Authorization: Bearer <accessToken>` header.

---

## ADR-002 — Quota counters in Redis, not PostgreSQL

**Decision:** Monthly secret creation counters live in Redis as `quota:monthly:{userId}:{YYYY-MM}` with a 35-day TTL.

**Why:** Redis `INCR` is atomic — no race conditions at high concurrency without needing DB transactions. The 35-day TTL means no cleanup jobs are needed. PostgreSQL would require a `SELECT ... FOR UPDATE` or advisory lock for the same guarantee.

---

## ADR-003 — Onboarding emails are condition-based, not just time-based

**Decision:** The `day2_nudge` email only fires if the user has zero secrets. `day7_api` only fires if they have no API key.

**Why:** Sending "you haven't created a secret" to someone who created 10 is noise and damages trust. Condition-based triggers are more relevant and produce better open rates.

**Consequence:** The job must query `_count` for `auditLogs` and `apiKeys` per user every hour. This is a Prisma query, not Redis.

---

## ADR-004 — Limits enforced server-side, silently

**Decision:** Users who exceed the maximum allowed TTL get downgraded to the maximum allowed (e.g. 24h). No error is returned.

**Why:** Returning a 403 "you can't do this" would break integrations that don't check the response carefully. Silent downgrade is more robust. The response includes `effectiveTtl` and `effectiveMaxViews` so informed clients can react appropriately.

---

## ADR-005 — All email sending goes through `email.service.ts`

**Decision:** No route or plugin calls the Resend API directly. All calls go through `sendEmail(to, type)` in `src/services/email.service.ts`.

**Why:** Centralises templates, makes it easy to swap email providers, and allows testing email sending without mocking scattered fetch calls.
