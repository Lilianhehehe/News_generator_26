# Architecture

This project is a small daily news generator. It can run as a local Node server or as Vercel serverless API routes with static files from `public/`.

## Current Structure

- `server.js` contains the shared backend logic and the local server entrypoint.
- `api/*.js` contains thin Vercel handlers that import `handleApi` from `server.js`.
- `public/index.html` contains the page markup.
- `public/app.js` contains browser-side state, API calls, form handling, and preview rendering.
- `public/styles.css` contains the visual styling.
- `vercel.json` defines Vercel builds, routes, and the daily cron route.
- `launchd/com.lisa.news-generator.plist` defines the local macOS background service.
- `data/config.json` and `data/history.json` are local runtime files and are ignored by git.
- `docs/features/` contains one document per major feature.

## Backend Flow

1. The UI or scheduler calls an API route.
2. The API handler reads saved config and history.
3. The digest workflow searches Google News RSS first.
4. If more unique articles are needed, it searches category-matched fallback RSS feeds.
5. Articles are filtered for freshness and repeat use.
6. Articles are ranked and selected for each enabled category.
7. OpenAI rewrites titles and summaries in simple English.
8. Generated summaries are validated.
9. The app renders HTML and text output.
10. If sending is allowed and the rewrite passed, Gmail API sends the email through the signed-in user's Google OAuth grant.
11. The digest and email result are stored in history.

## Deployment Paths

Local runs use `server.js` directly through `npm start`. The local server serves static files from `public/`, handles `/api/*`, and runs a scheduler every 30 seconds.

Vercel runs use `api/config.js`, `api/history.js`, `api/run.js`, and `api/cron.js`. Those files import shared logic from `server.js`. `vercel.json` routes static files to `public/` and API calls to `api/*.js`.

## Storage

Local mode reads and writes JSON files in `data/`.

Vercel mode uses Upstash Redis when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set. The older `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names are also accepted.

## Configuration

Runtime configuration currently comes from:

- Environment variables for API keys, Redis, model options, timeouts, server host/port, and cron secret.
- Saved user settings from local JSON or Redis.
- Hard-coded defaults in `server.js` for categories, fallback feeds, limits, and prompt rules.
- `vercel.json` for Vercel cron timing and routing.

## Future Code Placement

The current backend is concentrated in `server.js`. Future refactors should separate responsibilities into focused modules before adding large features:

- Fetching news belongs in a news source or feed module.
- Filtering, dedupe, scoring, and ranking belong in a topic filtering module.
- OpenAI prompting and output validation belong in a summarization module.
- HTML and text output belong in a formatting module.
- Gmail OAuth and API sending belong in an email delivery module.
- Local JSON and Redis logic belong in a storage module.
- API route parsing and responses belong in an HTTP/API module.
- Scheduler and digest orchestration belong in a workflow module.

Keep API paths and UI behavior stable unless the user asks for a behavior change.

## Feature Documents

Major features are documented in:

- `docs/features/daily-digest.md`
- `docs/features/topic-filtering.md`
- `docs/features/news-sources.md`
- `docs/features/summarization.md`
- `docs/features/summary-format.md`
- `docs/features/email-delivery.md`
- `docs/features/account-login.md`

Update the matching feature document whenever a task changes that feature's purpose, related files, data flow, config, edge cases, or testing notes.
