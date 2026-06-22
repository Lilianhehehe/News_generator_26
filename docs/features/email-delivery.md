# Email Delivery

## Purpose

Email delivery sends a completed digest through the signed-in user's Gmail account using the Gmail API. The message is always sent from the verified Gmail address to that same address.

## Related Files

- `server.js`: email HTML/text rendering, MIME creation, Gmail API sending, OAuth token refresh, and reconnect handling.
- `public/app.js`: displays whether the run sent an email or produced a preview/reconnect message.
- `docs/features/account-login.md`: explains Google OAuth login and token storage.
- `docs/features/daily-digest.md`: explains when delivery is called.

## Data Flow

1. A digest is generated and summarized.
2. The app renders email HTML and plain text.
3. `runDigest` checks whether sending was requested for the signed-in Gmail user.
4. The server refreshes that user's Google access token from the encrypted refresh token.
5. The app builds a multipart MIME message and base64url encodes it.
6. The server calls Gmail API `users/me/messages/send`.
7. The email result is saved into that user's history with the digest.
8. The API response includes the email result for the UI preview.

## Config and Environment

- `GOOGLE_CLIENT_ID`: Google OAuth client id.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `GOOGLE_REDIRECT_URI`: OAuth callback URL, usually `/api/auth/google/callback`.
- `AUTH_SECRET`: signs session cookies and encrypts stored refresh tokens.
- Required Google scopes include email identity and `https://www.googleapis.com/auth/gmail.send`.
- Email subject is currently `Daily News`.

## Edge Cases

- If OAuth is not configured, users cannot sign in or send.
- If the refresh token is missing, revoked, expired, or invalid, the app marks the user as needing reconnect.
- If Gmail send permission is missing, the app produces a preview/reconnect message instead of sending.
- If summarization did not finish successfully, the app does not send email.
- If `sendEmail` is false, the app generates a preview only.

## Testing Notes

- Test `/api/run` while signed out and confirm it returns 401.
- Test `sendEmail: false` from `/api/run` while signed in.
- Test that failed summarization prevents sending.
- Test revoked Google authorization and confirm the user is marked reconnect-needed.
- Test MIME rendering with categories that have articles and categories that only have errors.
