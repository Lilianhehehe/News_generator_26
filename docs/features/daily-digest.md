# Daily Digest

## Purpose

The daily digest feature creates the full news briefing for enabled categories. It can run from the web UI, from the local scheduler, or from Vercel Cron.

## Related Files

- `server.js`: `generateDigest`, `runDigest`, `runScheduledDigest`, `schedulerTick`, `handleApi`, storage helpers, and formatting calls.
- `api/run.js`: Vercel route wrapper for manual digest generation.
- `api/cron.js`: Vercel route wrapper for scheduled digest generation.
- `api/history.js`: Vercel route wrapper for reading saved digest history.
- `public/app.js`: calls `/api/run`, saves config first, and renders the result preview for the signed-in Gmail user.
- `docs/features/account-login.md`: explains how Google OAuth scopes config, history, and Gmail authorization.
- `vercel.json`: defines the `/api/cron` schedule.
- `launchd/com.lisa.news-generator.plist`: starts the local server as a background service.

## Data Flow

1. The UI posts to `/api/run` with a signed session cookie, Vercel Cron calls `/api/cron`, or the local scheduler calls `runScheduledDigest`.
2. For manual runs, the app reads the verified Gmail user's saved config and recent history.
3. Enabled categories are processed one by one.
4. Candidate articles are fetched, filtered, and ranked.
5. Publisher pages are checked for free access, paywall signals, and enough readable article text; only verified candidates are selected.
6. Selected articles and their temporary extracted evidence text are passed to the summarization step.
7. Validated summaries are formatted as HTML and plain text.
8. Gmail API sending runs only when requested, Google authorization is valid, and summarization succeeded.
9. The digest and email result are saved to that user's history without the temporary article text.
10. The API response returns the digest, HTML, text, and email result.
11. Scheduled runs iterate OAuth-registered Gmail users and apply each user's schedule, authorization check, and duplicate-send guard.
12. A scheduled run sends only when that user has explicitly enabled and saved `dailySendingEnabled`; manual runs are unaffected.

## Config and Environment

- `data/config.json`: local saved settings.
- `data/history.json`: local recent digest history.
- `data/users.json`: local registered user emails.
- `data/users/<encoded-email>/config.json`: local saved settings for one user.
- `data/users/<encoded-email>/history.json`: local recent digest history for one user.
- `data/users/<encoded-email>/auth.json`: encrypted Google OAuth authorization for one user.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`: Redis storage for Vercel.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: alternate Redis env names.
- `NEWS_CONFIG_KEY`: Redis key for saved config.
- `NEWS_HISTORY_KEY`: Redis key for history.
- `NEWS_USERS_KEY`: Redis key for registered user emails.
- `NEWS_USER_KEY_PREFIX`: Redis key prefix for user config and history.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `AUTH_SECRET`: required for strict Gmail OAuth login and sending.
- `CRON_SECRET`: optional secret for `/api/cron`.
- `sendTime`: saved local send time.
- `dailySendingEnabled`: per-user opt-in for scheduled sending. It defaults to `false`, including for older saved configs without this field.
- `timezone`: saved timezone, defaulting to `America/New_York`.
- `vercel.json`: Vercel Hobby Cron calls `/api/cron` once per day at 12:00 UTC.

## Edge Cases

- The scheduled route skips sending for a user if an email was already sent on the same local date.
- The scheduled route skips users who have not explicitly enabled daily sending. Signing in alone does not opt a user in.
- Vercel Cron does not require the configured local send hour because Hobby Cron is daily and UTC-based.
- The local scheduler only sends for users whose configured local time exactly matches the current minute.
- If there are no registered OAuth users yet, scheduled runs do not send.
- If a user's Google authorization is missing or revoked, scheduled runs skip that user and keep going.
- If no articles are selected for a category, the category gets an error message instead of filler news.
- If no candidate can be verified as freely readable with enough text, the category stays empty instead of using a paid or partial article.
- If summarization fails, the app hides short fallback summaries and does not send an email.
- History is capped to the most recent 20 digest records.

## Testing Notes

- Test `/api/config` while signed in to confirm settings load from the session user.
- Test `/api/run` while signed in with `sendEmail: false` to verify preview behavior.
- Test `/api/run` while signed out and confirm it returns 401.
- Test two different users to confirm config and history are separate.
- Test duplicate prevention by placing prior digest entries in history and confirming selected articles are not reused.
- Test that a paid or partial article is skipped and the next freely readable ranked candidate is selected.
- Test scheduled behavior by checking `/api/cron` with and without `CRON_SECRET`.
- Test that missing, false, and malformed `dailySendingEnabled` values skip scheduled sending, while strict boolean `true` allows it.
- Test that manual `/api/run` behavior is unchanged when daily sending is off.
- A future test harness should mock article fetching, summarization, and email sending so the digest can run without real APIs.
