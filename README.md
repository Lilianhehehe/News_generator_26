# Daily News Brief MVP

A small tool that creates a simple English daily news brief and emails it through Gmail. It can run locally as a small web server, or online on Vercel with Vercel Cron.

## Local start

```bash
npm start
```

打开：

```text
http://localhost:3000
```

## Deploy to Vercel

The Vercel version uses:

- Static files from `public/`
- Serverless API routes in `api/`
- Shared app logic from `server.js`
- Vercel Cron at `/api/cron`
- Upstash Redis for saved settings and news history

`vercel.json` explicitly routes `/` and static assets to `public/`, and routes `/api/*` to the serverless files in `api/`. This prevents Vercel from treating the local `server.js` file as the production root server.

Vercel Cron is configured in `vercel.json`:

```json
{
  "path": "/api/cron",
  "schedule": "0 12 * * *"
}
```

Vercel Cron runs on UTC time. Hobby accounts are limited to daily cron jobs, so the production Cron runs once per day at 12:00 UTC. That is about 8 a.m. in New York during daylight saving time and about 7 a.m. in New York during standard time. The Vercel Cron route sends when it is called, and the app checks the stored history so it does not send twice on the same local day.

### Vercel environment variables

Set these in the Vercel project:

```text
OPENAI_API_KEY=...
GMAIL_APP_PASSWORD=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Optional:

```text
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-4-8
OPENAI_MODEL=gpt-5-mini
GMAIL_USER=your-sender@gmail.com
CRON_SECRET=some-long-secret
NEWS_CONFIG_KEY=news-generator:config
NEWS_HISTORY_KEY=news-generator:history
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

If `CRON_SECRET` is set, requests to `/api/cron` must include the same value in the `x-cron-secret` header or as a bearer token. Leave it unset if you want Vercel Cron to call the route directly without extra headers.

Vercel's Upstash Redis Marketplace integration usually injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The app also accepts the older Upstash-style names `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## Local background service

This project can also run as a macOS background service. After installation, the local service runs while the computer is awake, logged in, and online.

Service file:

```text
launchd/com.lisa.news-generator.plist
```

Logs:

```text
data/launchd.out.log
data/launchd.err.log
```

If the computer is off or asleep, the local service may not send at the configured time.

## Gmail email setup

The app does not store a Gmail password in code. To send email locally, set:

```bash
export GMAIL_APP_PASSWORD="your Gmail app password"
npm start
```

The sender email is configured in the web page. If `GMAIL_APP_PASSWORD` is not set, Generate Now creates a preview but does not send email.

## OpenAI setup

Set `OPENAI_API_KEY` to generate validated English titles and detailed simple-English summaries:

```bash
export OPENAI_API_KEY="your OpenAI API Key"
export GMAIL_APP_PASSWORD="your Gmail app password"
npm start
```

The default model is `gpt-5-mini`. If `OPENAI_API_KEY` is not set, the app searches news but does not show short fallback summaries as final output.

## Claude API setup (bullet-point view)

The results page has a `Paragraph | Bullet Points` toggle. Bullet conversion happens at runtime. If `ANTHROPIC_API_KEY` is set, it uses the Claude API (default model `claude-opus-4-8`, override with `ANTHROPIC_MODEL`):

```bash
export ANTHROPIC_API_KEY="your Anthropic API key"
```

If not, it falls back to the existing `OPENAI_API_KEY` with `OPENAI_MODEL`. If neither key is set, paragraph mode still works and the bullet view shows a per-item error.

## Data storage

Local mode:

- Settings: `data/config.json`
- Recent history: `data/history.json`

Vercel mode:

- Settings: Upstash Redis key `news-generator:config`
- Recent history: Upstash Redis key `news-generator:history`

## Current scope

- Google News RSS 搜索，并过滤掉超过 10 天、缺少日期或日期无效的结果
- OpenAI 生成英文概括标题和约 90-130 个简单英文词的详细介绍
- 英文新闻页面与英文邮件正文
- 新闻方向开关
- 默认新闻方向：神经科学前沿研究、生物学前沿研究、美国重大新闻、中国重大新闻、世界政治新闻、世界经济新闻
- 每个新闻方向可以单独设置篇数
- 神经科学和生物学方向更偏顶级期刊、论文和研究发表
- 世界经济方向更偏大公司新闻、财报、并购、裁员、监管和供应链
- 自定义关键词、发送邮箱、接收邮箱和每日发送时间
- 手动立即生成
- 本地服务运行时的每日定时发送
