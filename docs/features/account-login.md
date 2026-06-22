# Account Login

## Purpose

Account login uses Google OAuth so a user must prove control of their Gmail address before using the app. The verified Gmail address scopes that user's settings, history, and Gmail sending authorization.

## Related Files

- `server.js`: OAuth routes, signed session cookies, encrypted token storage, session-protected APIs, and user-scoped config/history.
- `public/index.html`: Google sign-in panel, current-user display, sign-out, and disconnect controls.
- `public/app.js`: loads the signed-in session, blocks the app while signed out, and no longer sends user email as trusted input.
- `public/styles.css`: Google sign-in, auth error, and read-only Gmail field styles.
- `docs/features/email-delivery.md`: explains Gmail API sending with the user's OAuth grant.
- `docs/features/daily-digest.md`: explains user-scoped digest generation and scheduled sending.

## Data Flow

1. The signed-out app shows a Sign in with Google button.
2. `/api/auth/google/start` redirects the user to Google with email identity, Gmail send, and offline-access consent.
3. `/api/auth/google/callback` verifies OAuth state, exchanges the code, reads Google userinfo, requires a verified email, encrypts the refresh token, and sets a signed session cookie.
4. The UI calls `/api/auth/session`; authenticated users load their own config and history.
5. Manual app APIs read the signed session cookie. They do not trust `userEmail` from query strings or request bodies.
6. Sign out clears only the session cookie. Disconnect revokes/removes the stored Google authorization and removes the user from scheduled sending.

## Config and Storage

- Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `AUTH_SECRET`.
- Local user configs are stored under `data/users/<encoded-email>/config.json`.
- Local user histories are stored under `data/users/<encoded-email>/history.json`.
- Local encrypted OAuth data is stored under `data/users/<encoded-email>/auth.json`.
- Local scheduled-user index is `data/users.json`.
- Redis user data uses `NEWS_USER_KEY_PREFIX`, defaulting to `news-generator:user`.
- Redis scheduled-user index uses `NEWS_USERS_KEY`, defaulting to `news-generator:users`.

## Edge Cases

- If OAuth env vars are missing, the login screen shows which variables are missing.
- If Gmail send permission is not granted, the app asks the user to reconnect Google.
- If Google token refresh fails later, scheduled sending skips that user and marks reconnect needed.
- Sender and recipient Gmail addresses are always the verified session email.
- User config/history can remain after disconnect, but scheduled sending stops until Google is connected again.

## Testing Notes

- Visit the app signed out and confirm only Google sign-in is available.
- Call `/api/config` signed out and confirm it returns 401.
- Complete Google OAuth and confirm `/api/auth/session` returns the verified email.
- Confirm sender and recipient fields are read-only and match the verified email.
- Sign out and confirm the app returns to the login screen.
- Disconnect Google and confirm scheduled sending stops for that user.
