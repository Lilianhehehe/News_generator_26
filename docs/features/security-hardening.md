# Security Hardening

## Purpose

Abuse and attack-surface controls for the public deployment: request rate limiting,
cron authentication, request body size limits, and SSRF protection on outbound
article fetches. These protect against runaway third-party API cost, unauthorized
scheduled sends, memory exhaustion, and internal-network access.

## Related Files

- `server.js`:
  - Rate limiting: `checkRateLimit`, `checkRateLimitInMemory`, `enforceRateLimits`, `rateLimit`, `getRequestIp`, `rateLimitMemoryStore`.
  - Cron auth: `isValidCronSecret`, `safeStringEquals` (used by `/api/cron` in `dispatchApi`).
  - Body limit: `readRequestBody`, `PayloadTooLargeError` (mapped to HTTP 413 in `handleApi`).
  - SSRF guard: `assertSafeRemoteUrl`, `isPrivateIpAddress`, `readBodyWithLimit`, and the manual-redirect loop in `fetchArticlePage`.
- `tests/security.test.js`: unit coverage for all four controls.

## Behavior

### Rate limiting (`/api/run`, `/api/keywords`, `/api/bullets`, `/api/translate`)

- Every matched request must pass three scopes: per-IP/min, per-user/min, and (for
  `/api/run`) a per-user/hour and a global-per-min run cap.
- Fixed-window counters. Uses Redis (`INCR` + `EXPIRE`) when configured so limits hold
  across serverless instances; otherwise a per-process in-memory Map. If a Redis command
  fails, it falls back to the in-memory limiter (fails closed to limiting, never off).
- Exceeding any scope returns `429` with a `Retry-After` header.

### Cron authentication (`/api/cron`)

- **Fail-closed**: if `CRON_SECRET` is unset, all `/api/cron` requests are rejected `401`.
  The secret is compared with a constant-time check (`safeStringEquals`).
- The secret is read from the `x-cron-secret` header or `Authorization: Bearer <secret>`.

### Request body size limit

- `readRequestBody` streams and rejects bodies over `MAX_REQUEST_BODY_BYTES` (default 1 MB)
  with `PayloadTooLargeError`, returned as `413` with `Connection: close`.

### SSRF protection on article fetch

- `fetchArticlePage` validates every URL (including each redirect hop) via
  `assertSafeRemoteUrl` before fetching: protocol must be `http`/`https`, and the host must
  not resolve to a private, loopback, link-local, unique-local, CGNAT, or reserved address
  (blocks `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` incl. cloud metadata, `::1`, `fe80::/10`, `fc00::/7`).
- Redirects are followed manually (`redirect: "manual"`, max `NEWS_MAX_REDIRECTS`) so each hop is re-validated.
- Response bodies are read with a byte cap (`NEWS_MAX_RESPONSE_BYTES`, default 5 MB) to prevent memory exhaustion.

## Config (environment variables)

- `CRON_SECRET` — required in production; without it `/api/cron` is disabled (fail-closed).
- `RATE_LIMIT_USER_PER_MINUTE` (20), `RATE_LIMIT_USER_RUN_PER_HOUR` (12),
  `RATE_LIMIT_IP_PER_MINUTE` (40), `RATE_LIMIT_GLOBAL_RUN_PER_MINUTE` (30).
- `MAX_REQUEST_BODY_BYTES` (1_000_000), `NEWS_MAX_RESPONSE_BYTES` (5_000_000), `NEWS_MAX_REDIRECTS` (5).
- `AUTH_SECRET` — must be a long, high-entropy random value (≥ 32 bytes); it keys both
  session HMAC signing and refresh-token AES-256-GCM encryption.

## Known Assumptions, Edge Cases, and Limitations

- Rate-limit counters are best-effort. The in-memory fallback is per-instance, so a
  multi-instance deployment without Redis enforces limits per instance, not globally.
- The SSRF DNS resolution is subject to TOCTOU / DNS-rebinding (the record could change
  between the check and the fetch). It blocks the common cases; pinning the resolved IP at
  connect time would be needed for full protection.
- Rate limits apply only to the AI/digest endpoints; `/api/config`, `/api/history`, and
  auth routes are protected by session auth but not separately rate limited.

## How to Test / Verify

- `node --test tests/security.test.js` — unit tests for all four controls.
- Manual: start the server without `CRON_SECRET` and confirm `GET /api/cron` returns `401`;
  send a >1 MB body to `/api/translate` and confirm `413`; loop `/api/translate` past the
  per-minute limit and confirm `429`; point an article link at `http://127.0.0.1` and
  confirm the fetch is rejected.
