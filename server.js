import http from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync, createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { fileURLToPath } from "node:url";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadLocalEnv(path.join(__dirname, ".env.local"));

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const USERS_DIR = path.join(DATA_DIR, "users");
const USERS_INDEX_PATH = path.join(DATA_DIR, "users.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const IS_DIRECT_RUN = process.argv[1] && path.resolve(process.argv[1]) === __filename;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120_000);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 14_000);
const OPENAI_MAX_REWRITE_ATTEMPTS = Number(process.env.OPENAI_MAX_REWRITE_ATTEMPTS || 4);
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS || 60_000);
const ANTHROPIC_MAX_OUTPUT_TOKENS = Number(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS || 2_048);
const NEWS_MAX_AGE_DAYS = 10;
const NEWS_MAX_AGE_MS = NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const NEWS_FEED_TIMEOUT_MS = Number(process.env.NEWS_FEED_TIMEOUT_MS || 20_000);
const NEWS_ARTICLE_TIMEOUT_MS = Number(process.env.NEWS_ARTICLE_TIMEOUT_MS || 20_000);
const NEWS_MIN_ARTICLE_WORDS = Number(process.env.NEWS_MIN_ARTICLE_WORDS || 250);
const NEWS_MAX_ARTICLE_CHARS = Number(process.env.NEWS_MAX_ARTICLE_CHARS || 6_500);
const NEWS_ARTICLE_CHECK_CONCURRENCY = 4;
const NEWS_MAX_RESPONSE_BYTES = Number(process.env.NEWS_MAX_RESPONSE_BYTES || 5_000_000);
const NEWS_MAX_REDIRECTS = Number(process.env.NEWS_MAX_REDIRECTS || 5);
const MAX_REQUEST_BODY_BYTES = Number(process.env.MAX_REQUEST_BODY_BYTES || 1_000_000);
// Rate limits are expressed as { limit, windowSeconds } per scope. A request must
// pass all three scopes (user, ip, global) for the matched endpoint group.
const RATE_LIMIT_USER_PER_MINUTE = Number(process.env.RATE_LIMIT_USER_PER_MINUTE || 20);
const RATE_LIMIT_USER_RUN_PER_HOUR = Number(process.env.RATE_LIMIT_USER_RUN_PER_HOUR || 12);
const RATE_LIMIT_IP_PER_MINUTE = Number(process.env.RATE_LIMIT_IP_PER_MINUTE || 40);
const RATE_LIMIT_GLOBAL_RUN_PER_MINUTE = Number(process.env.RATE_LIMIT_GLOBAL_RUN_PER_MINUTE || 30);
const GOOGLE_NEWS_SOURCE_PRIORITY = 2;
const FALLBACK_FEED_SOURCE_PRIORITY = 3;
const APP_VERSION = "news-generator-2026-07-15-general-sources-v3";
const REDIS_CONFIG_KEY = process.env.NEWS_CONFIG_KEY || "news-generator:config";
const REDIS_HISTORY_KEY = process.env.NEWS_HISTORY_KEY || "news-generator:history";
const REDIS_USERS_KEY = process.env.NEWS_USERS_KEY || "news-generator:users";
const REDIS_USER_KEY_PREFIX = process.env.NEWS_USER_KEY_PREFIX || "news-generator:user";
const CRON_SECRET = process.env.CRON_SECRET || "";
const AUTH_SECRET = process.env.AUTH_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";
const SESSION_COOKIE_NAME = "news_session";
const OAUTH_STATE_COOKIE_NAME = "news_oauth_state";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send"
];
const NEWS_STYLE_PROMPT = [
  "You are an editor who writes useful English news briefings for normal readers.",
  "Apply these writing rules every time you generate the news briefing.",
  "",
  "Language rules:",
  "- Write directly in English.",
  "- Do not write Chinese first.",
  "- Do not translate from Chinese.",
  "- Do not leave any Chinese text in the final page.",
  "- Use simple English only.",
  "- Use very simple words.",
  "- Use clear, short sentences.",
  "- Each sentence should explain one main idea.",
  "- Avoid complex words when simple words work better.",
  "- Avoid formal phrases such as 'inform efforts,' 'provide a framework,' 'strategic,' 'long-term value,' 'market landscape,' and 'policy uncertainty.'",
  "",
  "Page structure rules:",
  "- Keep this structure: main title, generated time, category title, news title, news summary, publication time.",
  "- Do not change the page structure.",
  "- Do not use labels inside summaries, such as 'Why it matters:', 'Summary:', or 'Conclusion:'.",
  "- Each summary should be one natural paragraph.",
  "",
  "Summary rules:",
  "- Each news summary should be detailed enough to explain the news clearly, usually about 90-130 simple English words when the article data supports it.",
  "- Do not optimize for sentence count. Focus on useful information.",
  "- The summary must be long enough to help the reader understand the news without opening the link.",
  "- Do not write a short 2-3 sentence summary.",
  "- Include 4-6 concrete information points when supported by the article data.",
  "- Each information point should explain something new, not repeat the same idea.",
  "- For each news item, explain what happened, who or what is involved, why it matters, what is new or important, and what the reader should understand from it.",
  "- The summary should explain as many of these points as the article data supports: what happened; who or what is involved; what method, decision, event, or system is involved; what the key finding, result, or change is; why it matters; and what it may affect, help with, or lead to next.",
  "- Be specific. Avoid vague summaries such as 'This study may help future research' or 'This policy may affect the market.'",
  "- Explain reasons in simple and concrete language.",
  "- Explain the news directly. Do not write filler such as 'the article was published by,' 'the report says,' 'according to the source,' or 'the source reported.'",
  "- Do not mention the source name or publication time inside the summary.",
  "",
  "Topic-specific detail rules:",
  "- For business, finance, or economy news, include concrete details supported by the article, such as company and product names, market changes, numbers or prices, policy details, and business impact.",
  "- For layoffs, explain how many jobs are affected, when the cuts happen, which teams, locations, or workers are affected, the reason given, and the concrete impact on employees or the business whenever the article provides those details.",
  "- For biology, neuroscience, medicine, or research news, focus on the study question, what researchers found, what is new or innovative, why the finding matters, possible future uses, how it may help future research, and limits or open questions mentioned in the article.",
  "- For policy, law, or politics news, focus on what policy, law, or decision changed, who is affected, what may happen next, why the change matters, and what conflict or debate is involved.",
  "- For technology news, focus on what the technology does, what problem it tries to solve, what is new about it, who may use it, and what limits, risks, or open questions remain.",
  "- For international news, focus on which countries or groups are involved, what happened, and how it may affect relationships, security, trade, or public opinion.",
  "",
  "Evidence rules:",
  "- Use only information supported by the article data.",
  "- Every number, date, amount, percentage, timeline, and cause-and-effect claim must be directly supported by the article data.",
  "- If the article does not provide a number, date, reason, or impact, skip that detail. Do not estimate it, infer it, or fill it in.",
  "- Do not invent company names, research results, numbers, prices, future uses, political effects, quotes, examples, reactions, causes, or background context.",
  "- If a detail is not in the article data, skip that detail.",
  "- Do not write missing-detail disclaimers such as 'The article does not give specific company names.'",
  "- The goal is to include useful supported details, not to list missing information.",
  "",
  "Final self-check before returning:",
  "- Is the whole output in English?",
  "- Is there any Chinese text left?",
  "- Is each summary detailed enough, usually about 90-130 simple English words when the article data supports it?",
  "- Does each summary avoid being only 2-3 general sentences?",
  "- Are the sentences simple and clear?",
  "- Is each summary specific enough?",
  "- Does each summary explain what the news is about?",
  "- Does the summary avoid talking about the article, source, or publication time?",
  "- Did the summary avoid unsupported or invented facts?",
  "- Does the page keep the same structure?",
  "- If any check fails, revise the output before returning it."
].join("\n");

const categoryDisplayNames = {
  neuroscience: "Frontier Neuroscience Research",
  biology: "Frontier Biology Research",
  us_major_news: "Major U.S. Political News",
  china_major_news: "Major China Political News",
  world_politics: "World Politics",
  world_economy: "Global Company News"
};

const fallbackRssFeedsByCategory = {
  neuroscience: [
    { name: "Nature Neuroscience", url: "https://www.nature.com/neuro.rss", priority: 5 },
    { name: "Neuron", url: "https://www.cell.com/neuron/current.rss", priority: 5 },
    { name: "Science", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", priority: 4 },
    { name: "PNAS", url: "https://www.pnas.org/rss/current.xml", priority: 4 },
    { name: "MIT News Neuroscience", url: "https://news.mit.edu/rss/topic/neuroscience", priority: 3 }
  ],
  biology: [
    { name: "Nature", url: "https://www.nature.com/nature.rss", priority: 5 },
    { name: "Cell", url: "https://www.cell.com/cell/current.rss", priority: 5 },
    { name: "Science", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", priority: 4 },
    { name: "PNAS", url: "https://www.pnas.org/rss/current.xml", priority: 4 },
    { name: "EurekAlert Biology", url: "https://www.eurekalert.org/rss/biology.xml", priority: 3 }
  ],
  us_major_news: [
    { name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml", priority: 5 },
    { name: "PBS NewsHour Politics", url: "https://www.pbs.org/newshour/feeds/rss/politics", priority: 4 },
    { name: "BBC US & Canada", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", priority: 4 },
    { name: "Reuters Politics", url: "https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best", priority: 3 }
  ],
  china_major_news: [
    { name: "BBC Asia", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", priority: 5 },
    { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", priority: 4 },
    { name: "The Diplomat", url: "https://thediplomat.com/feed/", priority: 4 },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", priority: 3 }
  ],
  world_politics: [
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", priority: 5 },
    { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", priority: 4 },
    { name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", priority: 4 },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", priority: 3 }
  ],
  world_economy: [
    { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", priority: 5 },
    { name: "NPR Business", url: "https://feeds.npr.org/1006/rss.xml", priority: 4 },
    { name: "CNBC Business", url: "https://www.cnbc.com/id/10001147/device/rss/rss.html", priority: 4 },
    { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", priority: 3 }
  ]
};

const subscriptionOnlyNewsHosts = [
  "barrons.com",
  "bloomberg.com",
  "businessinsider.com",
  "economist.com",
  "ft.com",
  "foreignpolicy.com",
  "fortune.com",
  "hbr.org",
  "latimes.com",
  "marketwatch.com",
  "newyorker.com",
  "nytimes.com",
  "scientificamerican.com",
  "statnews.com",
  "telegraph.co.uk",
  "theatlantic.com",
  "thetimes.co.uk",
  "technologyreview.com",
  "washingtonpost.com",
  "wired.com",
  "wsj.com"
];

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const defaultConfig = {
  senderEmail: "lilianhe347208@gmail.com",
  recipientEmail: "zh2652@barnard.edu",
  dailySendingEnabled: false,
  sendTime: "08:00",
  timezone: "America/New_York",
  categories: [
    {
      id: "neuroscience",
      name: "Frontier Neuroscience Research",
      enabled: true,
      itemCount: 1,
      researchFocused: true,
      focus: "New neuroscience research, especially studies from major journals about the brain, neurons, cognition, and mental health.",
      keywordMode: "auto",
      keywords: [
        "neuroscience paper",
        "neuroscience publication",
        "Nature Neuroscience",
        "Neuron",
        "Science neuroscience",
        "Cell neuroscience"
      ],
      generatedKeywords: [
        "neuroscience paper",
        "neuroscience publication",
        "Nature Neuroscience",
        "Neuron",
        "Science neuroscience",
        "Cell neuroscience"
      ],
      customKeywords: []
    },
    {
      id: "biology",
      name: "Frontier Biology Research",
      enabled: true,
      itemCount: 1,
      researchFocused: true,
      focus: "New biology research, especially studies from major journals about cells, genes, disease, medicine, and life science.",
      keywordMode: "auto",
      keywords: [
        "biology paper",
        "biology publication",
        "Nature biology",
        "Science biology",
        "Cell biology",
        "PNAS biology"
      ],
      generatedKeywords: [
        "biology paper",
        "biology publication",
        "Nature biology",
        "Science biology",
        "Cell biology",
        "PNAS biology"
      ],
      customKeywords: []
    },
    {
      id: "us_major_news",
      name: "Major U.S. Political News",
      enabled: true,
      itemCount: 1,
      politicalFocused: true,
      focus: "Major United States political news, including the White House, Congress, courts, elections, and policy changes.",
      keywordMode: "auto",
      keywords: [
        "US politics breaking news",
        "White House Congress",
        "Trump administration",
        "Supreme Court",
        "US election policy"
      ],
      generatedKeywords: [
        "US politics breaking news",
        "White House Congress",
        "Trump administration",
        "Supreme Court",
        "US election policy"
      ],
      customKeywords: []
    },
    {
      id: "china_major_news",
      name: "Major China Political News",
      enabled: true,
      itemCount: 1,
      politicalFocused: true,
      focus: "Major China political news, including government policy, diplomacy, Taiwan, security, and official decisions.",
      keywordMode: "auto",
      keywords: [
        "China politics",
        "Chinese government policy",
        "Beijing official statement",
        "Taiwan China diplomacy",
        "China foreign policy"
      ],
      generatedKeywords: [
        "China politics",
        "Chinese government policy",
        "Beijing official statement",
        "Taiwan China diplomacy",
        "China foreign policy"
      ],
      customKeywords: []
    },
    {
      id: "world_politics",
      name: "World Politics",
      enabled: true,
      itemCount: 1,
      focus: "Important world politics, geopolitics, diplomacy, security, and major decisions by governments.",
      keywordMode: "auto",
      keywords: ["world politics", "geopolitics", "international politics"],
      generatedKeywords: ["world politics", "geopolitics", "international politics"],
      customKeywords: []
    },
    {
      id: "world_economy",
      name: "Global Company News",
      enabled: true,
      itemCount: 3,
      companyFocused: true,
      focus: "Major company news from around the world, including earnings, markets, mergers, layoffs, regulation, and supply chains.",
      keywordMode: "auto",
      keywords: [
        "major companies earnings",
        "global companies",
        "Big Tech earnings",
        "merger acquisition",
        "company layoffs",
        "supply chain company news",
        "market leaders regulation"
      ],
      generatedKeywords: [
        "major companies earnings",
        "global companies",
        "Big Tech earnings",
        "merger acquisition",
        "company layoffs",
        "supply chain company news",
        "market leaders regulation"
      ],
      customKeywords: []
    }
  ]
};

let lastSchedulerMinute = "";

async function ensureDataFiles() {
  if (hasRedisStorage()) return;
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(USERS_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    await writeJson(CONFIG_PATH, defaultConfig);
  }
  if (!existsSync(HISTORY_PATH)) {
    await writeJson(HISTORY_PATH, []);
  }
  if (!existsSync(USERS_INDEX_PATH)) {
    await writeJson(USERS_INDEX_PATH, []);
  }
}

function hasRedisStorage() {
  return Boolean(getRedisRestUrl() && getRedisRestToken());
}

function getRedisRestUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
}

function getRedisRestToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

function getRedisKeyForPath(filePath) {
  if (filePath === CONFIG_PATH) return REDIS_CONFIG_KEY;
  if (filePath === HISTORY_PATH) return REDIS_HISTORY_KEY;
  if (filePath === USERS_INDEX_PATH) return REDIS_USERS_KEY;
  return "";
}

async function redisCommand(command, ...args) {
  const baseUrl = getRedisRestUrl().replace(/\/+$/, "");
  const token = getRedisRestToken();
  if (!baseUrl || !token) {
    throw new Error("Upstash Redis storage is not configured.");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify([command, ...args])
  });

  if (!response.ok) {
    throw new Error(`Redis command failed with ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// In-memory fallback rate-limit store: key -> { count, resetAt }.
const rateLimitMemoryStore = new Map();

function checkRateLimitInMemory(key, limit, windowSeconds) {
  const now = Date.now();
  const entry = rateLimitMemoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitMemoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (rateLimitMemoryStore.size > 10_000) {
      for (const [existingKey, value] of rateLimitMemoryStore) {
        if (value.resetAt <= now) rateLimitMemoryStore.delete(existingKey);
      }
    }
    return { allowed: true, remaining: limit - 1, retryAfter: windowSeconds };
  }
  entry.count += 1;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining: limit - entry.count, retryAfter };
}

// Fixed-window counter. Uses Redis (atomic INCR + EXPIRE) when configured so the
// limit holds across serverless instances; otherwise falls back to per-process memory.
async function checkRateLimit(key, limit, windowSeconds) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, remaining: 0, retryAfter: 0 };
  }
  const namespacedKey = `news-generator:ratelimit:${key}`;
  if (hasRedisStorage()) {
    try {
      const count = Number(await redisCommand("INCR", namespacedKey));
      if (count === 1) {
        await redisCommand("EXPIRE", namespacedKey, windowSeconds);
      }
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfter: windowSeconds
      };
    } catch (error) {
      // If Redis is momentarily unavailable, fail closed to the in-memory limiter
      // rather than dropping rate limiting entirely.
      console.error("Rate limit Redis command failed, using memory fallback:", error.message || error);
    }
  }
  return checkRateLimitInMemory(namespacedKey, limit, windowSeconds);
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

// Enforces the user, ip, and global scopes for an endpoint group. Returns null when
// allowed, or a rejection object describing the exceeded scope.
async function enforceRateLimits(scopes) {
  for (const scope of scopes) {
    const result = await checkRateLimit(scope.key, scope.limit, scope.windowSeconds);
    if (!result.allowed) {
      return { scope: scope.name, retryAfter: result.retryAfter };
    }
  }
  return null;
}

async function rateLimit(req, res, { email, group }) {
  const ip = getRequestIp(req);
  const scopes = [
    { name: "ip", key: `ip:${ip}:min`, limit: RATE_LIMIT_IP_PER_MINUTE, windowSeconds: 60 }
  ];
  if (email) {
    scopes.push({ name: "user", key: `user:${email}:min`, limit: RATE_LIMIT_USER_PER_MINUTE, windowSeconds: 60 });
  }
  if (group === "run") {
    scopes.push({ name: "global-run", key: "global:run:min", limit: RATE_LIMIT_GLOBAL_RUN_PER_MINUTE, windowSeconds: 60 });
    if (email) {
      scopes.push({ name: "user-run", key: `user:${email}:run:hour`, limit: RATE_LIMIT_USER_RUN_PER_HOUR, windowSeconds: 3600 });
    }
  }
  const rejection = await enforceRateLimits(scopes);
  if (rejection) {
    res.setHeader("Retry-After", String(rejection.retryAfter));
    sendJson(res, 429, {
      error: "Too many requests. Please slow down and try again shortly."
    });
    return false;
  }
  return true;
}

async function readJson(filePath, fallback, options = {}) {
  const redisKey = options.redisKey || getRedisKeyForPath(filePath);
  if (redisKey && hasRedisStorage()) {
    const value = await redisCommand("GET", redisKey);
    if (!value) return fallback;
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return fallback;
    }
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readConfig() {
  const saved = await readJson(CONFIG_PATH, defaultConfig);
  return normalizeConfig(saved);
}

function normalizeConfig(saved) {
  const savedCategories = Array.isArray(saved.categories) ? saved.categories : defaultConfig.categories;
  const categories = savedCategories.map((category) => normalizeCategory(category, saved.maxItemsPerCategory));
  return {
    ...defaultConfig,
    ...saved,
    dailySendingEnabled: saved.dailySendingEnabled === true,
    categories
  };
}

function normalizeCategory(category, fallbackCount = 1) {
  const defaults = defaultConfig.categories.find((item) => item.id === category.id) || {};
  const isMigratingFocusedCategory = (defaults.researchFocused || defaults.companyFocused)
    && !("researchFocused" in category)
    && !("companyFocused" in category);
  const isMigratingPoliticalCategory = defaults.politicalFocused && !("politicalFocused" in category);
  const legacyKeywords = (isMigratingFocusedCategory || isMigratingPoliticalCategory)
    ? defaults.keywords
    : (category.keywords || defaults.keywords || []);
  const keywordMode = category.keywordMode === "auto" || category.keywordMode === "custom"
    ? category.keywordMode
    : "custom";
  const generatedKeywords = Array.isArray(category.generatedKeywords)
    ? category.generatedKeywords
    : (keywordMode === "auto" ? legacyKeywords : (defaults.generatedKeywords || legacyKeywords));
  const customKeywords = Array.isArray(category.customKeywords)
    ? category.customKeywords
    : (legacyKeywords || []);
  const focus = typeof category.focus === "string" && category.focus.trim()
    ? category.focus
    : (legacyKeywords || []).join(", ");
  const normalizedCategory = {
    ...defaults,
    ...category,
    focus: focus || defaults.focus || "",
    keywordMode,
    generatedKeywords: uniqueKeywords(generatedKeywords),
    customKeywords: uniqueKeywords(customKeywords),
    generatedKeywordsStale: Boolean(category.generatedKeywordsStale),
    itemCount: clampItemCount(category.itemCount ?? defaults.itemCount ?? fallbackCount ?? 1)
  };
  return {
    ...normalizedCategory,
    keywords: getCategorySearchKeywords(normalizedCategory)
  };
}

function clampItemCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(count, 1), 10);
}

async function writeJson(filePath, data, options = {}) {
  const redisKey = options.redisKey || getRedisKeyForPath(filePath);
  if (redisKey && hasRedisStorage()) {
    await redisCommand("SET", redisKey, JSON.stringify(data));
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeUserEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidUserEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getUserStorageId(email) {
  return encodeURIComponent(email);
}

function getUserConfigPath(email) {
  return path.join(USERS_DIR, getUserStorageId(email), "config.json");
}

function getUserHistoryPath(email) {
  return path.join(USERS_DIR, getUserStorageId(email), "history.json");
}

function getUserAuthPath(email) {
  return path.join(USERS_DIR, getUserStorageId(email), "auth.json");
}

function getUserRedisKey(email, type) {
  return `${REDIS_USER_KEY_PREFIX}:${getUserStorageId(email)}:${type}`;
}

async function readRegisteredUsers() {
  const users = await readJson(USERS_INDEX_PATH, []);
  if (!Array.isArray(users)) return [];
  return [...new Set(users.map(normalizeUserEmail).filter(isValidUserEmail))].sort();
}

async function writeRegisteredUsers(users) {
  const normalized = [...new Set(users.map(normalizeUserEmail).filter(isValidUserEmail))].sort();
  await writeJson(USERS_INDEX_PATH, normalized);
  return normalized;
}

async function registerUser(email) {
  const users = await readRegisteredUsers();
  if (!users.includes(email)) {
    await writeRegisteredUsers([...users, email]);
  }
}

async function unregisterUser(email) {
  const users = await readRegisteredUsers();
  if (users.includes(email)) {
    await writeRegisteredUsers(users.filter((user) => user !== email));
  }
}

async function readUserConfig(email) {
  const saved = await readJson(getUserConfigPath(email), null, {
    redisKey: getUserRedisKey(email, "config")
  });

  if (saved) {
    return normalizeConfig({
      ...saved,
      senderEmail: email,
      recipientEmail: email
    });
  }

  const baseConfig = await readConfig();
  return normalizeConfig({
    ...baseConfig,
    senderEmail: email,
    recipientEmail: email
  });
}

async function writeUserConfig(email, config) {
  const normalized = normalizeConfig({
    ...defaultConfig,
    ...config,
    senderEmail: email,
    recipientEmail: email
  });
  await registerUser(email);
  await writeJson(getUserConfigPath(email), normalized, {
    redisKey: getUserRedisKey(email, "config")
  });
  return normalized;
}

async function readUserHistory(email) {
  const history = await readJson(getUserHistoryPath(email), [], {
    redisKey: getUserRedisKey(email, "history")
  });
  return Array.isArray(history) ? history : [];
}

async function writeUserHistory(email, history) {
  await registerUser(email);
  await writeJson(getUserHistoryPath(email), history, {
    redisKey: getUserRedisKey(email, "history")
  });
}

async function readUserAuth(email) {
  const auth = await readJson(getUserAuthPath(email), null, {
    redisKey: getUserRedisKey(email, "auth")
  });
  return auth && typeof auth === "object" ? auth : null;
}

async function writeUserAuth(email, auth) {
  await registerUser(email);
  await writeJson(getUserAuthPath(email), auth, {
    redisKey: getUserRedisKey(email, "auth")
  });
}

async function deleteUserAuth(email) {
  const redisKey = getUserRedisKey(email, "auth");
  if (hasRedisStorage()) {
    await redisCommand("DEL", redisKey);
    return;
  }
  await rm(getUserAuthPath(email), { force: true });
}

function getAuthSetupStatus() {
  const missing = [];
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_REDIRECT_URI) missing.push("GOOGLE_REDIRECT_URI");
  if (!AUTH_SECRET) missing.push("AUTH_SECRET");
  return { configured: missing.length === 0, missing };
}

function requireAuthSetup() {
  const status = getAuthSetupStatus();
  if (!status.configured) {
    throw new Error(`Google OAuth is not configured. Missing: ${status.missing.join(", ")}`);
  }
}

function safeStringEquals(a, b) {
  const bufferA = Buffer.from(String(a || ""), "utf8");
  const bufferB = Buffer.from(String(b || ""), "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// Fail closed: /api/cron is rejected unless CRON_SECRET is configured AND matches.
// An unset CRON_SECRET must never leave the endpoint open.
function isValidCronSecret(provided) {
  if (!CRON_SECRET) return false;
  return safeStringEquals(provided, CRON_SECRET);
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return buffer.toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function getEncryptionKey() {
  if (!AUTH_SECRET) throw new Error("AUTH_SECRET is required.");
  return createHash("sha256").update(AUTH_SECRET).digest();
}

function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(".");
}

function decryptSecret(value) {
  const [version, ivText, tagText, encryptedText] = String(value || "").split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Stored Google authorization is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function signTokenPayload(payload) {
  if (!AUTH_SECRET) throw new Error("AUTH_SECRET is required.");
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySignedToken(token) {
  if (!AUTH_SECRET || !token) return null;
  const [body, signature] = String(token).split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return ["", ""];
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      return [decodeURIComponent(key), decodeURIComponent(value)];
    } catch {
      return [key, value];
    }
  }).filter(([key]) => key));
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted;
}

function buildCookie(name, value, req, options = {}) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, req) {
  return buildCookie(name, "", req, { maxAge: 0 });
}

function readSession(req) {
  const payload = verifySignedToken(parseCookies(req)[SESSION_COOKIE_NAME]);
  const email = normalizeUserEmail(payload?.email);
  if (!email || !isValidUserEmail(email) || !payload.sub) return null;
  return { email, sub: String(payload.sub) };
}

function requireSession(req, res) {
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Please sign in with Google first." });
    return null;
  }
  return session;
}

function setSessionCookie(res, req, session) {
  const token = signTokenPayload({
    email: session.email,
    sub: session.sub,
    iat: Date.now(),
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  });
  res.setHeader("Set-Cookie", buildCookie(SESSION_COOKIE_NAME, token, req, {
    maxAge: SESSION_MAX_AGE_SECONDS
  }));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { location, ...headers });
  res.end();
}

function redirectToHomeWithError(res, message, headers = {}) {
  redirect(res, `/?authError=${encodeURIComponent(message)}`, headers);
}

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google request failed with ${response.status}`);
  }
  return data;
}

async function exchangeGoogleCode(code) {
  const data = await postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code"
  });
  if (!data.access_token) throw new Error("Google did not return an access token.");
  return data;
}

async function refreshGoogleAccessToken(refreshToken) {
  const data = await postForm(GOOGLE_TOKEN_URL, {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  if (!data.access_token) throw new Error("Google did not return an access token.");
  return data;
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google userinfo failed with ${response.status}`);
  }
  return data;
}

function getGrantedScopes(tokenData = {}) {
  return String(tokenData.scope || "").split(/\s+/).filter(Boolean);
}

function hasGmailSendScope(scopes = []) {
  return scopes.includes("https://www.googleapis.com/auth/gmail.send");
}

async function storeGoogleAuth(email, userInfo, tokenData) {
  const existing = await readUserAuth(email);
  const refreshToken = tokenData.refresh_token || (existing?.encryptedRefreshToken ? decryptSecret(existing.encryptedRefreshToken) : "");
  if (!refreshToken) {
    throw new Error("Google did not return offline access. Please sign in again and approve Gmail sending.");
  }
  const scopes = getGrantedScopes(tokenData);
  const now = new Date().toISOString();
  await writeUserAuth(email, {
    provider: "google",
    googleSub: String(userInfo.sub || ""),
    email,
    emailVerified: Boolean(userInfo.email_verified),
    scopes,
    encryptedRefreshToken: encryptSecret(refreshToken),
    accessTokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : "",
    needsReconnect: !hasGmailSendScope(scopes),
    reconnectReason: hasGmailSendScope(scopes) ? "" : "Gmail send permission was not granted.",
    updatedAt: now,
    createdAt: existing?.createdAt || now
  });
}

async function getUserAccessToken(email) {
  try {
    requireAuthSetup();
  } catch (error) {
    return { ok: false, message: error.message };
  }
  const auth = await readUserAuth(email);
  if (!auth?.encryptedRefreshToken || auth.needsReconnect) {
    return {
      ok: false,
      message: auth?.reconnectReason || "Please reconnect Google so this app can send email from your Gmail account."
    };
  }
  if (!hasGmailSendScope(auth.scopes || [])) {
    await writeUserAuth(email, {
      ...auth,
      needsReconnect: true,
      reconnectReason: "Gmail send permission was not granted.",
      updatedAt: new Date().toISOString()
    });
    return { ok: false, message: "Please reconnect Google and approve Gmail sending." };
  }

  try {
    const tokenData = await refreshGoogleAccessToken(decryptSecret(auth.encryptedRefreshToken));
    await writeUserAuth(email, {
      ...auth,
      scopes: getGrantedScopes(tokenData).length ? getGrantedScopes(tokenData) : auth.scopes,
      accessTokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : auth.accessTokenExpiresAt,
      needsReconnect: false,
      reconnectReason: "",
      updatedAt: new Date().toISOString()
    });
    return { ok: true, accessToken: tokenData.access_token };
  } catch (error) {
    await writeUserAuth(email, {
      ...auth,
      needsReconnect: true,
      reconnectReason: error.message || "Google authorization failed. Please reconnect.",
      updatedAt: new Date().toISOString()
    });
    return { ok: false, message: "Google authorization failed. Please reconnect." };
  }
}

async function handleGoogleAuthStart(req, res) {
  try {
    requireAuthSetup();
  } catch (error) {
    return redirectToHomeWithError(res, error.message);
  }

  const state = randomBytes(24).toString("base64url");
  const stateCookie = signTokenPayload({
    state,
    exp: Date.now() + OAUTH_STATE_MAX_AGE_SECONDS * 1000
  });
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  redirect(res, authUrl.toString(), {
    "Set-Cookie": buildCookie(OAUTH_STATE_COOKIE_NAME, stateCookie, req, {
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS
    })
  });
}

async function handleGoogleAuthCallback(req, res, url) {
  const clearState = clearCookie(OAUTH_STATE_COOKIE_NAME, req);
  try {
    requireAuthSetup();
    const error = url.searchParams.get("error");
    if (error) throw new Error(url.searchParams.get("error_description") || error);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const statePayload = verifySignedToken(parseCookies(req)[OAUTH_STATE_COOKIE_NAME]);
    if (!code || !state || !statePayload?.state || state !== statePayload.state) {
      throw new Error("Google sign-in expired or failed. Please try again.");
    }

    const tokenData = await exchangeGoogleCode(code);
    const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
    const email = normalizeUserEmail(userInfo.email);
    if (!email || !isValidUserEmail(email) || !userInfo.email_verified) {
      throw new Error("Google did not verify this email address.");
    }
    if (!hasGmailSendScope(getGrantedScopes(tokenData))) {
      throw new Error("Gmail send permission was not granted.");
    }

    await storeGoogleAuth(email, userInfo, tokenData);
    await writeUserConfig(email, await readUserConfig(email));
    const sessionCookie = buildCookie(SESSION_COOKIE_NAME, signTokenPayload({
      email,
      sub: String(userInfo.sub || ""),
      iat: Date.now(),
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    }), req, { maxAge: SESSION_MAX_AGE_SECONDS });
    redirect(res, "/", { "Set-Cookie": [sessionCookie, clearState] });
  } catch (error) {
    redirectToHomeWithError(res, error.message || "Google sign-in failed.", {
      "Set-Cookie": clearState
    });
  }
}

async function getSessionResponse(req) {
  const status = getAuthSetupStatus();
  const session = readSession(req);
  if (!session) {
    return {
      authenticated: false,
      authConfigured: status.configured,
      missing: status.missing
    };
  }
  const auth = await readUserAuth(session.email);
  return {
    authenticated: true,
    authConfigured: status.configured,
    email: session.email,
    needsReconnect: Boolean(auth?.needsReconnect || !auth?.encryptedRefreshToken),
    reconnectReason: auth?.reconnectReason || ""
  };
}

async function handleLogout(req, res) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "Set-Cookie": clearCookie(SESSION_COOKIE_NAME, req)
  });
  res.end(JSON.stringify({ ok: true }));
}

async function handleDisconnect(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const auth = await readUserAuth(session.email);
  if (auth?.encryptedRefreshToken) {
    try {
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(auth.encryptedRefreshToken) })
      });
    } catch (error) {
      console.error("Google token revoke failed:", error.message || error);
    }
  }
  await deleteUserAuth(session.email);
  await unregisterUser(session.email);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "Set-Cookie": clearCookie(SESSION_COOKIE_NAME, req)
  });
  res.end(JSON.stringify({ ok: true }));
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

class PayloadTooLargeError extends Error {
  constructor(message = "Request body is too large.") {
    super(message);
    this.name = "PayloadTooLargeError";
    this.statusCode = 413;
  }
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body) > MAX_REQUEST_BODY_BYTES) throw new PayloadTooLargeError();
    return req.body ? JSON.parse(req.body) : {};
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";

  res.writeHead(200, { "content-type": type });
  createReadStream(filePath).pipe(res);
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function getTagRaw(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] : "";
}

function getTag(item, tag) {
  const raw = getTagRaw(item, tag);
  return raw ? stripTags(decodeXml(raw)) : "";
}

function getFirstTag(item, tags) {
  for (const tag of tags) {
    const value = getTag(item, tag);
    if (value) return value;
  }
  return "";
}

function getTagAttribute(item, tag, attribute) {
  const match = item.match(new RegExp(`<${tag}\\b([^>]*)>`, "i"));
  if (!match) return "";
  const attrMatch = match[1].match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"));
  return attrMatch ? decodeXml(attrMatch[1]).trim() : "";
}

function getAtomLink(entry) {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const [, attrs] of links) {
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] || "alternate";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href && rel === "alternate") return decodeXml(href).trim();
  }
  return getTag(entry, "link");
}

function withArticleSourceMetadata(article, feed, sourceType) {
  return {
    ...article,
    source: article.source || feed.name,
    feedName: feed.name,
    feedUrl: feed.url,
    sourceType,
    sourcePriority: feed.priority ?? FALLBACK_FEED_SOURCE_PRIORITY
  };
}

function parseRss(xml, feed = { name: "RSS Feed", url: "" }, sourceType = "rss") {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  return items.map(([, raw]) => ({
    title: getTag(raw, "title"),
    link: getTag(raw, "link"),
    originalUrl: getTag(raw, "guid") || getTagAttribute(raw, "source", "url"),
    source: getTag(raw, "source") || feed.name,
    publishedAt: getFirstTag(raw, ["pubDate", "dc:date", "published", "updated"]),
    snippet: getFirstTag(raw, ["description", "summary", "content:encoded", "content"])
  })).filter((item) => item.title && item.link).map((article) => withArticleSourceMetadata(article, feed, sourceType));
}

function parseAtom(xml, feed = { name: "Atom Feed", url: "" }, sourceType = "atom") {
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  return entries.map(([, raw]) => ({
    title: getTag(raw, "title"),
    link: getAtomLink(raw),
    originalUrl: getFirstTag(raw, ["id"]),
    source: feed.name,
    publishedAt: getFirstTag(raw, ["published", "updated"]),
    snippet: getFirstTag(raw, ["summary", "content"])
  })).filter((item) => item.title && item.link);
}

function parseFeed(xml, feed = { name: "News Feed", url: "" }, sourceType = "rss") {
  const rssArticles = parseRss(xml, feed, sourceType);
  if (rssArticles.length) return rssArticles;
  return parseAtom(xml, feed, sourceType).map((article) => withArticleSourceMetadata(article, feed, sourceType));
}

function getArticlePublishedTime(article) {
  const time = Date.parse(article.publishedAt || "");
  return Number.isFinite(time) ? time : null;
}

function isFreshArticle(article, now = Date.now()) {
  const publishedTime = getArticlePublishedTime(article);
  if (publishedTime === null) return false;
  return publishedTime <= now && now - publishedTime <= NEWS_MAX_AGE_MS;
}

function getUrlHostname(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSubscriptionOnlyHost(value = "") {
  const hostname = getUrlHostname(value);
  return subscriptionOnlyNewsHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function htmlFragmentToText(value = "") {
  return decodeXml(String(value))
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countArticleWords(value = "") {
  return (String(value).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
}

function hasPaywallSignals(html = "") {
  if (/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html)) return true;
  const hasPaywallMarkup = /\b(?:id|class|data-testid)=["'][^"']*(?:paywall|metered[-_ ]content|subscriber[-_ ]content|premium[-_ ]content)[^"']*["']/i.test(html);
  const visibleText = htmlFragmentToText(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  );
  const hasStrongReadingGate = /\b(?:subscribe(?:\s+now)?\s+to\s+(?:continue|keep)\s+reading|continue\s+reading\s+with\s+a\s+subscription|(?:sign|log)\s+in\s+to\s+(?:continue|keep)\s+reading|register\s+to\s+(?:continue|keep)\s+reading|unlock\s+(?:this|the)\s+(?:article|story)|(?:this|the)\s+(?:article|story|content)\s+is\s+(?:only\s+)?(?:available\s+)?(?:to|for)\s+subscribers|subscriber[ -]only|to\s+read\s+(?:the\s+rest|this\s+article|the\s+full\s+article)|you\s+have\s+\d+\s+(?:free\s+)?articles?\s+(?:left|remaining))\b/i.test(visibleText);
  return hasStrongReadingGate || (hasPaywallMarkup && /\b(?:subscribe|subscription|subscriber|unlock)\b/i.test(visibleText));
}

function getVisiblePageText(html = "") {
  return htmlFragmentToText(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
  );
}

function hasNonArticleGateSignals(html = "") {
  const visibleText = getVisiblePageText(html);
  const investorTypeGate = /\bselect\s+your\s+investor\s+type\b/i.test(visibleText)
    || (
      /\binstitutional\s+investor\b/i.test(visibleText)
      && /\bindividual\s+investor\b/i.test(visibleText)
      && /\bfinancial\s+intermediar(?:y|ies)\b/i.test(visibleText)
    );
  const accessOrDownloadGate = /\b(?:choose|select)\s+your\s+(?:location|country|region|investor\s+type)\b|\brequest\s+(?:article\s+)?access\b|\bdownload\s+(?:the\s+)?(?:full\s+)?report\b|\bcomplete\s+the\s+form\s+to\s+(?:access|read|download)\b/i.test(visibleText);
  return investorTypeGate || accessOrDownloadGate;
}

function isArticleSchemaType(value) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) => /(?:^|\b)(?:article|newsarticle|analysisnewsarticle|reportagenewsarticle)$/i.test(String(type || "")));
}

function collectJsonLdArticleBodies(html = "") {
  const bodies = [];
  const scripts = [...String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (isArticleSchemaType(value["@type"]) && typeof value.articleBody === "string") {
      bodies.push(htmlFragmentToText(value.articleBody));
    }
    Object.values(value).forEach(visit);
  };

  for (const [, attributes, rawJson] of scripts) {
    if (!/\btype=["'][^"']*ld\+json/i.test(attributes)) continue;
    try {
      visit(JSON.parse(rawJson.trim()));
    } catch {
      // Invalid publisher metadata is ignored; visible article markup is checked next.
    }
  }
  return bodies.filter(Boolean);
}

function countSubstantiveParagraphs(html = "") {
  return [...String(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlFragmentToText(match[1]))
    .filter((text) => text.length >= 80)
    .length;
}

function hasArticlePageSignals(html = "") {
  if (collectJsonLdArticleBodies(html).length) return true;
  if (/<article\b[^>]*>[\s\S]*?<\/article>/i.test(html)) return true;
  const hasOpenGraphArticle = /<meta\b(?=[^>]*\bproperty=["']og:type["'])(?=[^>]*\bcontent=["']article["'])[^>]*>/i.test(html);
  const mainBlocks = [...String(html).matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)];
  return hasOpenGraphArticle && mainBlocks.some((match) => countSubstantiveParagraphs(match[1]) >= 3);
}

const BUSINESS_EVENT_PATTERN = /\b(?:(?:will|to|plans?\s+to|agreed\s+to)\s+(?:invest|fund)|announc(?:e|ed|es|ing)|acquir(?:e|ed|es|ing)|buy|bought|sell|sold|merg(?:e|ed|er|es|ing)|layoffs?|laid\s+off|cut(?:s|ting)?|hire[ds]?|hiring|invest(?:s|ed|ing)|fund(?:ed|ing)|launch(?:es|ed|ing)?|expand(?:s|ed|ing)?|clos(?:e|ed|es|ing)|open(?:s|ed|ing)?|report(?:s|ed|ing)|file[ds]?|approve[ds]?|reject(?:s|ed)?|raise[ds]?|lower(?:s|ed)?|increase[ds]?|decrease[ds]?|rise[sn]?|rose|fall(?:s|ing)?|fell|gain(?:s|ed)?|drop(?:s|ped)?|declin(?:e|ed|es|ing)|resign(?:s|ed|ing)?|appoint(?:s|ed|ing)?|recall(?:s|ed|ing)?|default(?:s|ed|ing)?|bankrupt(?:cy)?|restructur(?:e|ed|es|ing))\b/i;

function getBusinessEvidenceScore(value = "") {
  const text = String(value);
  let score = 0;
  if (BUSINESS_EVENT_PATTERN.test(text)) score += 2;
  if (/(?:[$€£¥]\s?\d|\bUSD\s?\d|\b\d[\d,.]*\s?(?:dollars?|euros?|pounds?|yuan)\b)/i.test(text)) score += 2;
  if (/\b\d+(?:\.\d+)?\s?(?:%|percent|percentage points?)\b/i.test(text)) score += 2;
  if (/\b\d[\d,]*(?:\.\d+)?\s+(?:jobs?|employees?|workers?|roles?|stores?|offices?|factories|plants?|customers?|users?|shares?|units?)\b/i.test(text)) score += 2;
  if (/\b(?:Q[1-4]|first|second|third|fourth)\s+(?:quarter|half)|\bfiscal\s+(?:year|quarter)|\bquarterly\b/i.test(text)) score += 1;
  if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s+\d{4})?|\b(?:19|20)\d{2}\b/i.test(text)) score += 1;
  if (/\b(?:revenue|profit|loss|earnings|costs?|charges?|forecast|guidance|valuation|market\s+share|interest\s+rate|workforce)\b/i.test(text)) score += 1;
  if (/\b(?:because|after|due\s+to|as\s+a\s+result|will\s+affect|expects?\s+to|impact|response\s+times?|operations?)\b/i.test(text)) score += 1;
  return score;
}

function hasConcreteBusinessEvidence(value = "") {
  return BUSINESS_EVENT_PATTERN.test(String(value)) && getBusinessEvidenceScore(value) >= 3;
}

function extractReadableArticleText(html = "") {
  const jsonLdBodies = collectJsonLdArticleBodies(html);
  const cleanedHtml = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|noscript|svg|form|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|form|nav|header|footer|aside)>/gi, " ");
  const articleBlocks = [...cleanedHtml.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => match[1]);
  const mainBlocks = [...cleanedHtml.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/gi)].map((match) => match[1]);
  const hasOpenGraphArticle = /<meta\b(?=[^>]*\bproperty=["']og:type["'])(?=[^>]*\bcontent=["']article["'])[^>]*>/i.test(cleanedHtml);
  const validMainBlocks = hasOpenGraphArticle
    ? mainBlocks.filter((block) => countSubstantiveParagraphs(block) >= 3)
    : [];
  const contentBlocks = articleBlocks.length ? articleBlocks : validMainBlocks;
  const markupCandidates = contentBlocks.map((block) => {
    const paragraphs = [];
    const seen = new Set();
    const matches = [...block.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)];
    for (const [, fragment] of matches) {
      const text = htmlFragmentToText(fragment);
      const key = text.toLowerCase();
      if (
        text.length < 40 ||
        seen.has(key) ||
        /^(?:advertisement|sign up|subscribe|read more|related articles?|copyright|all rights reserved)\b/i.test(text)
      ) continue;
      seen.add(key);
      paragraphs.push(text);
    }
    return paragraphs.join("\n\n");
  });

  const candidates = [...jsonLdBodies, ...markupCandidates].filter(Boolean);
  return candidates.sort((a, b) => countArticleWords(b) - countArticleWords(a))[0] || "";
}

function getCanonicalArticleUrl(html = "", fallbackUrl = "") {
  const links = [...String(html).matchAll(/<link\b([^>]*)>/gi)];
  for (const [, attributes] of links) {
    if (!/\brel=["'][^"']*canonical/i.test(attributes)) continue;
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      return new URL(decodeXml(href), fallbackUrl).toString();
    } catch {
      return fallbackUrl;
    }
  }
  return fallbackUrl;
}

async function resolveGoogleNewsPublisherUrl(googleNewsUrl, html) {
  const articleId = new URL(googleNewsUrl).pathname.split("/").filter(Boolean).pop();
  const timestamp = String(html).match(/\bdata-n-a-ts=["']([^"']+)["']/i)?.[1];
  const signature = String(html).match(/\bdata-n-a-sg=["']([^"']+)["']/i)?.[1];
  if (!articleId || !timestamp || !signature) {
    throw new Error("Google News publisher link parameters were missing");
  }

  const requestPayload = [
    "Fbv4je",
    JSON.stringify([
      "garturlreq",
      [
        ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0
      ],
      articleId,
      Number(timestamp),
      signature
    ])
  ];
  const { controller, timer } = withTimeout(NEWS_ARTICLE_TIMEOUT_MS);
  try {
    const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "referer": "https://news.google.com/",
        "user-agent": "Mozilla/5.0 (compatible; PersonalNewsGenerator/0.2; +https://example.com/news-reader)"
      },
      body: new URLSearchParams({ "f.req": JSON.stringify([[requestPayload]]) })
    });
    if (!response.ok) throw new Error(`Google News publisher lookup returned ${response.status}`);
    const responseText = await response.text();
    const jsonStart = responseText.indexOf("[[");
    if (jsonStart === -1) throw new Error("Google News publisher lookup returned no data");
    const rows = JSON.parse(responseText.slice(jsonStart).trim());
    const resultRow = rows.find((row) => row?.[0] === "wrb.fr" && row?.[1] === "Fbv4je");
    const publisherUrl = resultRow?.[2] ? JSON.parse(resultRow[2])?.[1] : "";
    if (!/^https?:\/\//i.test(publisherUrl) || getUrlHostname(publisherUrl).endsWith("google.com")) {
      throw new Error("Google News publisher link could not be resolved");
    }
    return publisherUrl;
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateIpAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpAddress(mapped[1]);
    return false;
  }
  return false;
}

// SSRF guard: only allow http(s) URLs whose host does not resolve to a private,
// loopback, link-local, or otherwise internal address. Note: this resolves DNS at
// check time; a DNS-rebinding attacker could still change the record between this
// check and the actual fetch (TOCTOU). It blocks the common cases (literal internal
// IPs, hosts that resolve to internal ranges, cloud metadata endpoints).
async function assertSafeRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("article URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("article URL must use http or https");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error("article URL points to an internal address");
    return parsed;
  }
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("article host could not be resolved");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("article host resolves to an internal address");
  }
  return parsed;
}

async function readBodyWithLimit(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("article response was too large");
    return text;
  }
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("article response was too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function fetchArticlePage(url) {
  const { controller, timer } = withTimeout(NEWS_ARTICLE_TIMEOUT_MS);
  try {
    let currentUrl = url;
    let response;
    for (let redirects = 0; ; redirects += 1) {
      await assertSafeRemoteUrl(currentUrl);
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "accept": "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; PersonalNewsGenerator/0.2; +https://example.com/news-reader)"
        }
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirects >= NEWS_MAX_REDIRECTS) throw new Error("article had too many redirects");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }
    if (!response.ok) throw new Error(`article returned ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("article did not return an HTML page");
    }
    const html = await readBodyWithLimit(response, NEWS_MAX_RESPONSE_BYTES);
    return { html, url: response.url || currentUrl };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectFreeReadableArticle(article, { companyFocused = false } = {}) {
  if (isSubscriptionOnlyHost(article.link)) {
    return { ok: false, reason: "known subscription-only source" };
  }

  try {
    let page = await fetchArticlePage(article.link);
    let canonicalUrl = getCanonicalArticleUrl(page.html, page.url);
    if (getUrlHostname(page.url) === "news.google.com") {
      const publisherUrl = getUrlHostname(canonicalUrl) !== "news.google.com"
        ? canonicalUrl
        : await resolveGoogleNewsPublisherUrl(article.link, page.html);
      page = await fetchArticlePage(publisherUrl);
      canonicalUrl = getCanonicalArticleUrl(page.html, page.url);
    }

    const finalUrl = canonicalUrl || page.url;
    if (getUrlHostname(finalUrl) === "news.google.com") {
      return { ok: false, reason: "publisher page could not be resolved" };
    }
    if (isSubscriptionOnlyHost(finalUrl) || isSubscriptionOnlyHost(page.url)) {
      return { ok: false, reason: "known subscription-only source" };
    }
    if (hasNonArticleGateSignals(page.html)) {
      return { ok: false, reason: "page is an access gate or non-article landing page" };
    }
    if (hasPaywallSignals(page.html)) {
      return { ok: false, reason: "page shows a paywall or reading gate" };
    }
    if (!hasArticlePageSignals(page.html)) {
      return { ok: false, reason: "page does not expose a verifiable article body" };
    }

    const readableText = extractReadableArticleText(page.html);
    const wordCount = countArticleWords(readableText);
    if (wordCount < NEWS_MIN_ARTICLE_WORDS) {
      return { ok: false, reason: `only ${wordCount} readable words were available` };
    }

    const businessEvidenceScore = companyFocused
      ? getBusinessEvidenceScore(`${article.title || ""} ${readableText}`)
      : 0;
    if (companyFocused && !hasConcreteBusinessEvidence(`${article.title || ""} ${readableText}`)) {
      return { ok: false, reason: "article does not contain enough concrete business details" };
    }

    const evidenceText = readableText.length > NEWS_MAX_ARTICLE_CHARS
      ? `${readableText.slice(0, NEWS_MAX_ARTICLE_CHARS).replace(/\s+\S*$/, "")}...`
      : readableText;
    return {
      ok: true,
      article: {
        ...article,
        link: finalUrl,
        originalUrl: article.originalUrl || article.link,
        articleText: evidenceText,
        accessVerified: true,
        businessEvidenceScore
      }
    };
  } catch (error) {
    return { ok: false, reason: error.message || "article page could not be checked" };
  }
}

async function searchGoogleNews(query, limit) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en"
  });
  const { controller, timer } = withTimeout(NEWS_FEED_TIMEOUT_MS);
  try {
    const response = await fetch(`https://news.google.com/rss/search?${params.toString()}`, {
      signal: controller.signal,
      headers: { "user-agent": "PersonalNewsGenerator/0.1" }
    });
    if (!response.ok) {
      throw new Error(`Google News returned ${response.status}`);
    }
    return parseFeed(
      await response.text(),
      { name: "Google News", url: "https://news.google.com/rss/search", priority: GOOGLE_NEWS_SOURCE_PRIORITY },
      "google_news"
    ).filter((article) => isFreshArticle(article)).slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeedArticles(feed, limit) {
  const { controller, timer } = withTimeout(NEWS_FEED_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "user-agent": "PersonalNewsGenerator/0.1" }
    });
    if (!response.ok) {
      throw new Error(`${feed.name} returned ${response.status}`);
    }
    return parseFeed(await response.text(), feed, "fallback_rss")
      .filter((article) => isFreshArticle(article))
      .slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

function getFallbackFeedsForCategory(category) {
  return fallbackRssFeedsByCategory[category.id] || [];
}

async function searchFallbackFeeds(category, limit) {
  const feeds = getFallbackFeedsForCategory(category);
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeedArticles(feed, limit)));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

function articleHaystack(article) {
  return `${article.title} ${article.source} ${article.snippet}`.toLowerCase();
}

function scoreArticle(article, category) {
  const text = articleHaystack(article);
  let score = 0;

  if (category.researchFocused) {
    const journalTerms = [
      "nature", "science", "cell", "neuron", "pnas", "lancet", "cell press",
      "nature neuroscience", "nature medicine", "new england journal"
    ];
    const researchTerms = [
      "paper", "publication", "published", "study", "research",
      "journal", "article", "trial", "researchers"
    ];
    for (const term of journalTerms) if (text.includes(term)) score += 5;
    for (const term of researchTerms) if (text.includes(term)) score += 2;
    if (/(pet|cat|dog|spot|zoo|recipe|celebrity)/i.test(text)) score -= 8;
  }

  if (category.companyFocused) {
    const companyTerms = [
      "earnings", "revenue", "profit", "shares", "stock", "company",
      "companies", "big tech", "merger", "acquisition", "layoffs",
      "regulation", "supply chain", "ceo", "market share", "quarter"
    ];
    for (const term of companyTerms) if (text.includes(term)) score += 3;
  }

  if (category.politicalFocused) {
    const politicalTerms = [
      "politics", "government", "policy", "election", "congress",
      "white house", "supreme court", "ministry", "diplomacy",
      "sanctions", "lawmakers", "president", "administration"
    ];
    for (const term of politicalTerms) if (text.includes(term)) score += 3;
  }

  return score;
}

function getSourcePriorityScore(article) {
  const priority = Number(article.sourcePriority || 0);
  return Number.isFinite(priority) ? priority : 0;
}

function getRankedArticleCandidates(articles, category, requiredCount) {
  const ranked = dedupeArticles(articles)
    .map((article, index) => {
      const relevanceScore = scoreArticle(article, category);
      return {
        article,
        index,
        relevanceScore,
        score: relevanceScore + getSourcePriorityScore(article)
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (category.researchFocused || category.companyFocused) {
    const focused = ranked.filter((item) => item.relevanceScore > 0).map((item) => item.article);
    if (focused.length >= requiredCount) return focused;
  }

  return ranked.map((item) => item.article);
}

function getFocusSearchKeywords(focus = "") {
  const cleaned = cleanFocus(focus);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/[,，;\n]/)
    .map((part) => part.replace(/^(?:and|or|including|include|especially|about|with)\s+/i, "").trim())
    .filter(Boolean);
  return uniqueKeywords(parts.length > 1 ? parts : [cleaned]);
}

function getCategorySearchKeywords(category = {}) {
  const normalized = getFocusSearchKeywords(category.focus || "");
  return normalized.length ? normalized : uniqueKeywords(category.keywords || []);
}

function buildSearchQuery(category) {
  const keywords = getCategorySearchKeywords(category);
  const joinedKeywords = keywords.length ? keywords.join(" OR ") : getCategoryDisplayName(category);

  if (category.researchFocused) {
    return `(${joinedKeywords}) (paper OR publication OR study OR "research article" OR journal) when:${NEWS_MAX_AGE_DAYS}d`;
  }

  if (category.companyFocused) {
    return `(${joinedKeywords}) (company OR earnings OR shares OR merger OR acquisition OR layoffs OR regulation OR "supply chain") when:${NEWS_MAX_AGE_DAYS}d`;
  }

  if (category.politicalFocused) {
    return `(${joinedKeywords}) (politics OR government OR policy OR election OR diplomacy OR congress OR "White House" OR ministry) when:${NEWS_MAX_AGE_DAYS}d`;
  }

  return `${[getCategoryDisplayName(category), joinedKeywords].filter(Boolean).join(" OR ")} when:${NEWS_MAX_AGE_DAYS}d`;
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const linkKeys = getArticleLinkKeys(article);
    const titleKey = getArticleTitleKey(article);
    if (
      linkKeys.some((linkKey) => seen.has(`link:${linkKey}`)) ||
      (titleKey && seen.has(`title:${titleKey}`))
    ) {
      return false;
    }
    for (const linkKey of linkKeys) seen.add(`link:${linkKey}`);
    if (titleKey) seen.add(`title:${titleKey}`);
    return true;
  });
}

function createArticleMemory() {
  return { links: new Set(), titles: new Set() };
}

function getArticleLinkKey(article = {}) {
  const raw = String(article.link || "").trim();
  return normalizeUrlForKey(raw);
}

function normalizeUrlForKey(raw = "") {
  raw = String(raw || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") {
        url.searchParams.delete(key);
      }
    }
    return url.toString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function getArticleLinkKeys(article = {}) {
  const keys = [
    article.link,
    article.originalUrl,
    article.guid,
    article.url
  ].map((value) => normalizeUrlForKey(value)).filter(Boolean);
  return [...new Set(keys)];
}

function normalizeArticleTitleForKey(value = "") {
  return String(value)
    .replace(/\s+-\s+[^-]{2,80}$/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function getArticleTitleKey(article = {}) {
  return normalizeArticleTitleForKey(article.originalTitle || article.title || "");
}

function addArticleToMemory(memory, article = {}) {
  const linkKeys = getArticleLinkKeys(article);
  const titleKey = getArticleTitleKey(article);
  for (const linkKey of linkKeys) memory.links.add(linkKey);
  if (titleKey) memory.titles.add(titleKey);
  if (article.originalTitle && article.title && article.originalTitle !== article.title) {
    const displayTitleKey = normalizeArticleTitleForKey(article.title);
    if (displayTitleKey) memory.titles.add(displayTitleKey);
  }
}

function isArticleInMemory(memory, article = {}) {
  const linkKeys = getArticleLinkKeys(article);
  const titleKey = getArticleTitleKey(article);
  return Boolean(
    linkKeys.some((linkKey) => memory.links.has(linkKey)) ||
    (titleKey && memory.titles.has(titleKey))
  );
}

function buildRecentArticleMemory(history = [], now = Date.now()) {
  const memory = createArticleMemory();
  for (const digest of Array.isArray(history) ? history : []) {
    const generatedTime = Date.parse(digest?.generatedAt || "");
    if (!Number.isFinite(generatedTime) || now - generatedTime > NEWS_MAX_AGE_MS) continue;
    for (const category of digest.categories || []) {
      for (const article of category.articles || []) {
        addArticleToMemory(memory, article);
      }
    }
  }
  return memory;
}

function filterFreshUnusedArticles(articles, recentMemory, currentRunMemory) {
  return articles.filter((article) =>
    isFreshArticle(article) &&
    !isArticleInMemory(recentMemory, article) &&
    !isArticleInMemory(currentRunMemory, article)
  );
}

async function selectFreeReadableArticlesForCategory(
  articles,
  category,
  itemCount,
  recentMemory,
  currentRunMemory,
  accessCheckCache
) {
  const candidates = filterFreshUnusedArticles(dedupeArticles(articles), recentMemory, currentRunMemory);
  const ranked = getRankedArticleCandidates(candidates, category, itemCount);
  const selected = [];

  for (let index = 0; index < ranked.length && selected.length < itemCount; index += NEWS_ARTICLE_CHECK_CONCURRENCY) {
    const batch = ranked.slice(index, index + NEWS_ARTICLE_CHECK_CONCURRENCY);
    const checks = await Promise.all(batch.map(async (article) => {
      const cacheKey = `${getArticleLinkKey(article)}|company:${Boolean(category.companyFocused)}`;
      if (!accessCheckCache.has(cacheKey)) {
        accessCheckCache.set(cacheKey, inspectFreeReadableArticle(article, {
          companyFocused: Boolean(category.companyFocused)
        }));
      }
      return { article, result: await accessCheckCache.get(cacheKey) };
    }));

    const orderedChecks = category.companyFocused
      ? [...checks].sort((a, b) =>
        Number(b.result.article?.businessEvidenceScore || 0) - Number(a.result.article?.businessEvidenceScore || 0)
      )
      : checks;
    for (const { article, result } of orderedChecks) {
      if (result.ok && selected.length < itemCount) {
        selected.push(result.article);
      } else if (!result.ok) {
        console.info(`Skipped article without verified free full text: ${article.title} (${result.reason})`);
      }
    }
  }

  return selected;
}

async function findArticlesForCategory(category, options = {}) {
  const itemCount = clampItemCount(options.itemCount ?? category.itemCount ?? 1);
  const searchLimit = options.searchLimit ?? Math.min(Math.max(itemCount * 20, 20), 50);
  const recentMemory = options.recentMemory || createArticleMemory();
  const currentRunMemory = options.currentRunMemory || createArticleMemory();
  const selectionMemory = {
    links: new Set(currentRunMemory.links || []),
    titles: new Set(currentRunMemory.titles || [])
  };
  const accessCheckCache = options.accessCheckCache || new Map();
  const searchGoogleNewsFn = options.searchGoogleNewsFn || searchGoogleNews;
  const searchFallbackFeedsFn = options.searchFallbackFeedsFn || searchFallbackFeeds;
  const selectArticlesFn = options.selectArticlesFn || selectFreeReadableArticlesForCategory;
  const query = buildSearchQuery(category);
  const selected = [];

  const selectFrom = async (candidates) => {
    if (!candidates.length || selected.length >= itemCount) return;
    const additions = await selectArticlesFn(
      candidates,
      category,
      itemCount - selected.length,
      recentMemory,
      selectionMemory,
      accessCheckCache
    );
    for (const article of additions) {
      selected.push(article);
      addArticleToMemory(selectionMemory, article);
    }
  };

  if (selected.length < itemCount) {
    try {
      await selectFrom(await searchGoogleNewsFn(query, searchLimit));
    } catch (error) {
      console.error(`Google News search failed for ${category.id}:`, error.message || error);
    }
  }

  if (selected.length < itemCount) {
    await selectFrom(await searchFallbackFeedsFn(category, searchLimit));
  }

  return selected;
}

function getCategoryDisplayName(category) {
  return categoryDisplayNames[category.id] || category.name;
}

function summarizeArticle(article) {
  const text = article.snippet || article.title;
  const cleaned = text.replace(article.title, "").replace(/\s+-\s+[^-]+$/, "").trim();
  const title = article.title.replace(/\s+-\s+[^-]+$/, "").trim();
  if (!cleaned || cleaned === article.source || cleaned.length < 12) {
    return `This article covers "${title}." Open the link to read the full story.`;
  }
  return cleaned.slice(0, 220) + (cleaned.length > 220 ? "..." : "");
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

function fallbackEnglishTitle(article) {
  return article.title.replace(/\s+-\s+[^-]+$/, "").trim();
}

function normalizeEnglishTitle(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeEnglishSummary(value = "") {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:^|\n)\s*(?:Why it matters|One-sentence summary|Summary|Conclusion)\s*:\s*/gi, "\n")
    .replace(/\s*(?:Why it matters|One-sentence summary|Summary|Conclusion)\s*:\s*/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function containsChineseText(value = "") {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(String(value));
}

function getArticleKey(article) {
  return `${article.categoryId}|${article.link}`;
}

function countSummaryWords(value = "") {
  return (String(value).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || []).length;
}

function hasSourceOrTimeFiller(value = "") {
  return /\b(?:the\s+)?(?:article|report|story|piece|source)\s+(?:was\s+)?(?:published|reported|written|says|said|states|stated|notes|noted|comes\s+from)\b|\baccording\s+to\s+(?:the\s+)?(?:article|report|story|piece|source|publisher)\b|\bpublished\s+(?:by|in|on)\b|\breported\s+by\b/iu.test(String(value));
}

function getGeneratedArticleIssues(article) {
  const issues = [];
  const title = normalizeEnglishTitle(article?.englishTitle);
  const summary = normalizeEnglishSummary(article?.englishSummary);
  const wordCount = countSummaryWords(summary);

  if (!title) issues.push("missing English title");
  if (!summary) issues.push("missing English summary");
  if (containsChineseText(title) || containsChineseText(summary)) {
    issues.push("contains Chinese text");
  }
  if (wordCount < 70) {
    issues.push(`summary has ${wordCount} words; it must be more detailed and usually about 90-130 simple English words when the article data supports it`);
  }
  if (wordCount > 160) {
    issues.push(`summary has ${wordCount} words; make it shorter and closer to 90-130 simple English words`);
  }
  if (hasSourceOrTimeFiller(summary)) {
    issues.push("summary talks about the article, report, source, or publication instead of explaining the news directly");
  }
  return issues;
}

function validateGeneratedArticles(generatedArticles = [], expectedArticles = []) {
  const issues = [];
  const generatedByKey = new Map(generatedArticles.map((article) => [getArticleKey(article), article]));

  for (const expected of expectedArticles) {
    const key = getArticleKey(expected);
    const generated = generatedByKey.get(key);
    if (!generated) {
      issues.push(`${key}: missing generated article`);
      continue;
    }

    for (const issue of getGeneratedArticleIssues(generated)) {
      issues.push(`${key}: ${issue}`);
    }
  }

  return issues;
}

function isValidGeneratedArticle(article) {
  return getGeneratedArticleIssues(article).length === 0;
}

// Assembles the final per-category article list from the model output.
// Hard requirement: every category that has a candidate article must show news.
// A category ends up empty ONLY when the search found no candidate articles for it.
// When the model summary is unusable (missing or contains Chinese) we fall back to a
// snippet-based English summary instead of dropping the article and emptying the category.
function finalizeBriefingCategories(digest, generatedArticles = []) {
  const generatedByKey = new Map(
    generatedArticles.map((article) => [getArticleKey(article), article])
  );
  let fallbackCount = 0;

  for (const category of digest.categories) {
    const finalArticles = [];
    for (const article of category.articles) {
      const {
        articleText: _articleText,
        businessEvidenceScore: _businessEvidenceScore,
        ...publicArticle
      } = article;
      const generated = generatedByKey.get(`${category.id}|${article.link}`);
      const englishTitle = normalizeEnglishTitle(generated?.englishTitle) || fallbackEnglishTitle(article);
      const englishSummary = normalizeEnglishSummary(generated?.englishSummary);
      const modelSummaryUsable = Boolean(englishSummary)
        && !containsChineseText(englishSummary)
        && !containsChineseText(englishTitle);

      let summary;
      if (modelSummaryUsable) {
        summary = englishSummary;
        if (!isValidGeneratedArticle(generated)) fallbackCount += 1;
      } else {
        const snippetSummary = summarizeArticle(article);
        summary = containsChineseText(snippetSummary)
          ? `This story covers "${englishTitle}." Open the link to read the full report.`
          : snippetSummary;
        fallbackCount += 1;
      }

      finalArticles.push({
        ...publicArticle,
        originalTitle: article.title,
        title: englishTitle,
        summary
      });
    }
    category.articles = finalArticles;
    if (!category.articles.length && !category.error) {
      category.error = "No relevant articles were found today.";
    }
  }

  return fallbackCount;
}

function extractResponseText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  const textParts = [];
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        textParts.push(content.text);
      }
    }
  }
  return textParts.join("\n").trim();
}

function formatOpenAIError(status, body) {
  try {
    const parsed = JSON.parse(body);
    const code = parsed.error?.code;
    if (status === 429 && code === "insufficient_quota") {
      return "The OpenAI API key does not have available quota or billing access. Please check the OpenAI billing and usage settings.";
    }
    return parsed.error?.message || `OpenAI API returned ${status}`;
  } catch {
    return `OpenAI API returned ${status}: ${body.slice(0, 180)}`;
  }
}

function formatAnthropicError(status, body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || `Anthropic API returned ${status}`;
  } catch {
    return `Anthropic API returned ${status}: ${body.slice(0, 180)}`;
  }
}

const BULLET_CONVERSION_SYSTEM_PROMPT = [
  "You convert research and news summaries from paragraph form into bullet points. You always respond with only the bullet points and nothing else — no preamble, no labels, no explanation.",
  "",
  "Rules:",
  "1. Plain bullets only, each starting with \"- \". Do NOT use section labels like \"What happened\" or \"Why it matters\". Do not repeat the title or timestamp.",
  "2. Every bullet is a direct declarative statement about the subject itself. NEVER write about the article: no \"The article...\", \"The piece covers...\", \"It notes...\", \"An overview explains...\". Bad: \"It describes how Japan works with other countries on trade deals.\" Good: \"Japan negotiates trade deals and security partnerships with other countries.\"",
  "3. Write 2 to 5 substantial bullets, not many one-line fragments. Group closely related ideas into the same bullet (a bullet may have 1-3 short sentences). Do not start every bullet with the same word — vary sentence openings.",
  "4. Be specific: keep every concrete actor, action, number, date, place, mechanism, and consequence that the paragraph contains. Drop pure filler that carries no information (e.g. \"this shapes its relations with other nations\"). Never drop key qualifiers (e.g. \"no direct treatment reported yet\").",
  "5. Strictly no new information: do not add facts, examples, names, or numbers that are not in the original paragraph — not even well-known ones. This is a reformatting task only. If the paragraph contains few specifics, output fewer, shorter bullets instead of padding."
].join("\n");

const TRANSLATION_SYSTEM_PROMPT = [
  "You translate English news and research bullet points into Simplified Chinese. You respond with only the translated text and nothing else — no preamble, no explanation, no pinyin.",
  "",
  "Rules:",
  "1. Keep the exact same structure: same number of bullets, same line breaks. Every line that starts with \"- \" in the input must start with \"- \" in the output.",
  "2. Write natural, idiomatic, everyday Chinese — the way a normal person would explain it, not a stiff machine translation. Use simple, common words; avoid rare or overly formal/literary vocabulary.",
  "3. Do not add, drop, or change any facts. Translate faithfully; do not summarize or embellish.",
  "4. Keep established scientific terms accurate (e.g. glycosylation → 糖基化, hippocampus → 海马体), but phrase the surrounding sentence plainly.",
  "5. Translate a date/time line into natural Chinese (e.g. \"7/5/2026, 8:00:00 PM\" → \"2026年7月5日，晚上8:00\")."
].join("\n");

async function runTextModel(systemPrompt, userMessage, { maxTokens } = {}) {
  if (process.env.ANTHROPIC_API_KEY) {
    return runTextModelWithClaude(systemPrompt, userMessage, maxTokens);
  }
  if (process.env.OPENAI_API_KEY) {
    return runTextModelWithOpenAI(systemPrompt, userMessage, maxTokens);
  }
  throw new Error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable this feature.");
}

async function runTextModelWithClaude(systemPrompt, userMessage, maxTokens) {
  const { controller, timer } = withTimeout(ANTHROPIC_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens || ANTHROPIC_MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(formatAnthropicError(response.status, body));
    }

    const responseJson = await response.json();
    if (responseJson.stop_reason === "refusal") {
      throw new Error("The model declined this request.");
    }
    const text = (responseJson.content || [])
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) {
      throw new Error("The model returned an empty response.");
    }
    return { text, generatedBy: ANTHROPIC_MODEL };
  } finally {
    clearTimeout(timer);
  }
}

async function runTextModelWithOpenAI(systemPrompt, userMessage, maxTokens) {
  const { controller, timer } = withTimeout(OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: maxTokens || 2000,
        reasoning: { effort: "minimal" },
        instructions: systemPrompt,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }]
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(formatOpenAIError(response.status, body));
    }

    const text = extractResponseText(await response.json()).trim();
    if (!text) {
      throw new Error("The model returned an empty response.");
    }
    return { text, generatedBy: OPENAI_MODEL };
  } finally {
    clearTimeout(timer);
  }
}

async function convertSummaryToBullets({ title = "", timestamp = "", paragraph = "" }) {
  const userMessage = [
    "Convert the following summary into bullet point format:",
    "",
    `Title: ${title}`,
    `Timestamp: ${timestamp}`,
    `Paragraph: ${paragraph}`
  ].join("\n");

  const { text, generatedBy } = await runTextModel(BULLET_CONVERSION_SYSTEM_PROMPT, userMessage);
  return { bullets: text, generatedBy };
}

async function translateToChinese({ text = "" }) {
  const userMessage = [
    "Translate the following English text into natural, simple Simplified Chinese. Keep the same line and bullet structure.",
    "",
    text
  ].join("\n");

  const { text: translation, generatedBy } = await runTextModel(TRANSLATION_SYSTEM_PROMPT, userMessage);
  return { translation, generatedBy };
}

function cleanKeyword(value = "") {
  return String(value)
    .replace(/[，;|]/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function uniqueKeywords(keywords = []) {
  const seen = new Set();
  return keywords
    .map(cleanKeyword)
    .filter((keyword) => keyword && keyword.length <= 80)
    .filter((keyword) => {
      const key = keyword.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function cleanFocus(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function fallbackKeywordsForCategory(categoryName = "", focusText = "") {
  const name = cleanKeyword(categoryName);
  const focus = cleanFocus(focusText);
  const lower = `${name} ${focus}`.toLowerCase();
  const base = name && name !== "New Category" ? name : "latest news";

  if (/(neuro|brain|psych|cognitive|mental)/i.test(lower)) {
    return uniqueKeywords([
      `${base} research`,
      `${base} study`,
      `${base} paper`,
      "Nature Neuroscience",
      "Neuron",
      "Science neuroscience",
      "brain research news"
    ]);
  }

  if (/(bio|medicine|medical|health|gene|cell|disease|cancer)/i.test(lower)) {
    return uniqueKeywords([
      `${base} research`,
      `${base} study`,
      `${base} paper`,
      "Nature biology",
      "Science biology",
      "Cell biology",
      "medical research news"
    ]);
  }

  if (/(business|econom|market|finance|company|stock|earnings)/i.test(lower)) {
    return uniqueKeywords([
      `${base} news`,
      `${base} companies`,
      `${base} earnings`,
      "major companies earnings",
      "merger acquisition",
      "company layoffs",
      "market regulation"
    ]);
  }

  if (/(politic|policy|law|election|court|government|diplomacy)/i.test(lower)) {
    return uniqueKeywords([
      `${base} politics`,
      `${base} policy`,
      `${base} government`,
      `${base} election`,
      "diplomacy news",
      "court decision",
      "lawmakers"
    ]);
  }

  if (/(tech|ai|software|chip|robot|cyber|startup)/i.test(lower)) {
    return uniqueKeywords([
      `${base} technology`,
      `${base} AI`,
      `${base} companies`,
      `${base} product`,
      "technology policy",
      "cybersecurity news",
      "startup funding"
    ]);
  }

  return uniqueKeywords([
    `${base} news`,
    `${base} latest`,
    `${base} breaking news`,
    `${base} policy`,
    `${base} research`,
    `${base} companies`,
    `${base} global`
  ]);
}

async function generateKeywords(categoryName = "", focusText = "") {
  const apiKey = process.env.OPENAI_API_KEY;
  const focus = cleanFocus(focusText);
  const fallback = fallbackKeywordsForCategory(categoryName, focus);

  if (!apiKey) {
    return { keywords: fallback, generatedBy: "fallback" };
  }

  const { controller, timer } = withTimeout(OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: 1200,
        reasoning: { effort: "minimal" },
        instructions: [
          "Generate useful English keyword suggestions for a personal news generator.",
          "The user may choose these suggestions and add them to a Focus field.",
          "Use the topic title and focus text as the source.",
          "Make the keywords specific enough for news and article search.",
          "Avoid keywords that are too broad.",
          "Return short comma-style search phrases.",
          "Use simple English.",
          "Do not include Chinese text.",
          "Do not include explanations."
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  `News topic title: ${categoryName}`,
                  `Focus text: ${focus || "(none provided)"}`,
                  "Return 6 to 10 focused search keywords as a clean structured list."
                ].join("\n")
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "news_category_keywords",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                keywords: {
                  type: "array",
                  minItems: 6,
                  maxItems: 10,
                  items: { type: "string" }
                }
              },
              required: ["keywords"]
            }
          },
          verbosity: "low"
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(formatOpenAIError(response.status, body));
    }

    const responseJson = await response.json();
    const parsed = JSON.parse(extractResponseText(responseJson));
    const keywords = uniqueKeywords(parsed.keywords);
    return { keywords: keywords.length ? keywords : fallback, generatedBy: keywords.length ? OPENAI_MODEL : "fallback" };
  } catch (error) {
    return { keywords: fallback, generatedBy: "fallback", warning: error.message || "Keyword generation failed." };
  } finally {
    clearTimeout(timer);
  }
}

async function createEnglishBriefings(digest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const articlesForModel = digest.categories.flatMap((category) =>
    category.articles.map((article) => ({
      categoryId: category.id,
      categoryName: getCategoryDisplayName(category),
      researchFocused: Boolean(category.researchFocused),
      companyFocused: Boolean(category.companyFocused),
      politicalFocused: Boolean(category.politicalFocused),
      originalTitle: article.title,
      source: article.source,
      publishedAt: article.publishedAt,
      snippet: article.snippet,
      articleText: article.articleText,
      link: article.link
    }))
  );

  if (!apiKey || articlesForModel.length === 0) {
    if (!apiKey) {
      for (const category of digest.categories) {
        category.articles = [];
        category.error = "OPENAI_API_KEY is not set, so no validated detailed summaries were generated.";
      }
    }
    return {
      digest,
      briefingResult: {
        enhanced: false,
        message: apiKey
          ? "No articles were available to rewrite."
          : "OPENAI_API_KEY is not set. No validated detailed summaries were generated."
      }
    };
  }

  const { controller, timer } = withTimeout(OPENAI_TIMEOUT_MS);
  try {
    const requestBriefings = async (revisionIssues = []) => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
          reasoning: { effort: "minimal" },
          instructions: NEWS_STYLE_PROMPT,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    "Create a simple English news briefing from the articles below.",
                    "Use the fixed NEWS_STYLE_PROMPT rules from the system instructions.",
                    "englishTitle must be a short English title. Do not include the word 'Title'.",
                    "englishSummary must be one natural English paragraph with enough detail to understand the news without opening the link.",
                    "Write about 90-130 simple English words when the article data supports it.",
                    "Do not focus on sentence count. Focus on useful information.",
                    "Include 4-6 concrete information points when supported by the article data.",
                    "Each information point should explain something new, not repeat the same idea.",
                    "The summary should explain as many of these points as the article data supports: what happened; who or what is involved; what method, decision, event, or system is involved; what the key finding, result, or change is; why it matters; and what it may affect, help with, or lead to next.",
                    "Do not add a point if the article data does not support it.",
                    "Do not use labels or bullet points.",
                    "Use only the title, source, date, snippet, and verified freely readable article text below as evidence.",
                    "Give the verified article text more weight than the short RSS snippet.",
                    "Do not add facts, examples, future steps, reactions, or background context unless they are directly supported by that evidence.",
                    "If a type of detail is missing, skip it and use other useful details that are supported.",
                    "Do not write disclaimers about missing company names, numbers, prices, examples, or data.",
                    "Before returning, run the final self-check from NEWS_STYLE_PROMPT and revise your output if needed.",
                    revisionIssues.length
                      ? `The previous output failed these checks. Revise all affected items before returning:\n${revisionIssues.join("\n")}`
                      : "",
                    "",
                    JSON.stringify(articlesForModel, null, 2)
                  ].filter(Boolean).join("\n")
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "daily_news_briefings",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  articles: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        categoryId: { type: "string" },
                        link: { type: "string" },
                        englishTitle: { type: "string" },
                        englishSummary: { type: "string" }
                      },
                      required: ["categoryId", "link", "englishTitle", "englishSummary"]
                    }
                  }
                },
                required: ["articles"]
              }
            },
            verbosity: "medium"
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(formatOpenAIError(response.status, body));
      }

      const responseJson = await response.json();
      return JSON.parse(extractResponseText(responseJson));
    };

    let parsed = { articles: [] };
    let validationIssues = [];
    for (let attempt = 0; attempt < OPENAI_MAX_REWRITE_ATTEMPTS; attempt += 1) {
      parsed = await requestBriefings(validationIssues);
      validationIssues = validateGeneratedArticles(parsed.articles || [], articlesForModel);
      if (!validationIssues.length) break;
    }

    const fallbackCount = finalizeBriefingCategories(digest, parsed.articles || []);

    return {
      digest,
      briefingResult: {
        enhanced: true,
        message: fallbackCount
          ? `English briefing generated with ${OPENAI_MODEL}. ${fallbackCount} item(s) used a shorter fallback summary.`
          : `English briefing generated with ${OPENAI_MODEL}.`
      }
    };
  } catch (error) {
    for (const category of digest.categories) {
      category.articles = [];
      category.error = "No validated detailed summaries were generated.";
    }
    return {
      digest,
      briefingResult: {
        enhanced: false,
        message: `OpenAI English rewrite failed. No short fallback summaries were shown: ${error.message || "Unknown error"}`
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function prepareCategoryForSearch(category) {
  const keywords = getCategorySearchKeywords(category);
  return {
    ...category,
    keywords
  };
}

async function generateDigest(config, history = []) {
  const enabledCategories = config.categories.filter((category) => category.enabled);
  const recentMemory = buildRecentArticleMemory(history);
  const currentRunMemory = createArticleMemory();
  const accessCheckCache = new Map();
  const digest = {
    generatedAt: new Date().toISOString(),
    briefingResult: { enhanced: false, message: "English rewrite has not run yet." },
    categories: []
  };

  for (const category of enabledCategories) {
    const searchCategory = await prepareCategoryForSearch(category);
    const activeKeywords = getCategorySearchKeywords(searchCategory);
    const itemCount = clampItemCount(searchCategory.itemCount || config.maxItemsPerCategory || 1);
    const searchLimit = Math.min(Math.max(itemCount * 20, 20), 50);
    try {
      const articles = await findArticlesForCategory(searchCategory, {
        itemCount,
        searchLimit,
        recentMemory,
        currentRunMemory,
        accessCheckCache
      });

      for (const article of articles) {
        addArticleToMemory(currentRunMemory, article);
      }

      digest.categories.push({
        id: searchCategory.id,
        name: getCategoryDisplayName(searchCategory),
        keywords: activeKeywords,
        itemCount,
        researchFocused: Boolean(searchCategory.researchFocused),
        companyFocused: Boolean(searchCategory.companyFocused),
        politicalFocused: Boolean(searchCategory.politicalFocused),
        articles: articles.map((article) => ({
          ...article,
          originalTitle: article.title,
          summary: summarizeArticle(article)
        })),
        error: articles.length
          ? undefined
          : "No new non-repeated articles with verified free full text were found for this category today."
      });
    } catch (error) {
      digest.categories.push({
        id: searchCategory.id,
        name: getCategoryDisplayName(searchCategory),
        keywords: activeKeywords,
        itemCount,
        researchFocused: Boolean(searchCategory.researchFocused),
        companyFocused: Boolean(searchCategory.companyFocused),
        politicalFocused: Boolean(searchCategory.politicalFocused),
        articles: [],
        error: error.message || "No new non-repeated articles with verified free full text were found for this category today."
      });
    }
  }

  const enhanced = await createEnglishBriefings(digest);
  enhanced.digest.briefingResult = enhanced.briefingResult;
  return enhanced.digest;
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatArticleTime(article) {
  if (!article.publishedAt) return "";
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US");
}

function renderEmailHtml(digest) {
  const sections = digest.categories.map((category) => {
    const items = category.articles.map((article) => `
      <li style="margin:0 0 16px 0;">
        <a href="${escapeHtml(article.link)}" style="color:#165d59;font-size:18px;line-height:1.35;font-weight:700;text-decoration:none;">${escapeHtml(article.title)}</a>
        <div style="margin-top:8px;color:#263735;line-height:1.7;white-space:pre-line;">${escapeHtml(article.summary)}</div>
        <div style="margin-top:4px;color:#71817f;font-size:13px;">${escapeHtml(formatArticleTime(article))}</div>
      </li>
    `).join("");
    return `
      <h2 style="margin:28px 0 12px;color:#0f2926;font-size:20px;">${escapeHtml(category.name)}</h2>
      <ul style="padding-left:20px;margin:0;">${items || `<li>${escapeHtml(category.error || "No relevant articles were found today.")}</li>`}</ul>
    `;
  }).join("");

  return `
    <main style="font-family:Georgia,'Times New Roman','Noto Serif SC',serif;background:#f7f4ea;padding:28px;">
      <section style="max-width:760px;margin:0 auto;background:#fffef8;border:1px solid #d8d1bf;padding:32px;">
        <p style="margin:0;color:#7a4b2b;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">Daily Brief</p>
        <h1 style="margin:8px 0 10px;color:#102c29;font-size:32px;">Daily News</h1>
        <p style="margin:0;color:#687775;">Generated at: ${escapeHtml(new Date(digest.generatedAt).toLocaleString("en-US"))}</p>
        ${sections}
      </section>
    </main>
  `;
}

function renderTextDigest(digest) {
  return digest.categories.map((category) => {
    const items = category.articles.map((article, index) =>
      `${index + 1}. ${article.title}\n${article.summary}\nPublished: ${formatArticleTime(article) || "Unknown"}\nLink: ${article.link}`
    ).join("\n\n");
    return `[${category.name}]\n${items || category.error || "No relevant articles were found today."}`;
  }).join("\n\n");
}

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;
}

function renderGmailMimeMessage({ from, to, subject, html, text }) {
  const boundary = `news-${Date.now()}`;
  return [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`
  ].join("\r\n");
}

async function sendGmailFromUser({ userEmail, subject, html, text, accessToken = "" }) {
  const tokenResult = accessToken ? { ok: true, accessToken } : await getUserAccessToken(userEmail);
  if (!tokenResult.ok) {
    return {
      sent: false,
      previewOnly: true,
      needsReconnect: true,
      message: tokenResult.message
    };
  }

  const mime = renderGmailMimeMessage({
    from: userEmail,
    to: userEmail,
    subject,
    html,
    text
  });
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenResult.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const auth = await readUserAuth(userEmail);
      if (auth) {
        await writeUserAuth(userEmail, {
          ...auth,
          needsReconnect: true,
          reconnectReason: data.error?.message || "Gmail send permission failed. Please reconnect.",
          updatedAt: new Date().toISOString()
        });
      }
      return {
        sent: false,
        previewOnly: true,
        needsReconnect: true,
        message: "Gmail send permission failed. Please reconnect Google."
      };
    }
    throw new Error(data.error?.message || `Gmail API failed with ${response.status}`);
  }

  return {
    sent: true,
    previewOnly: false,
    gmailMessageId: data.id || "",
    message: `Email sent from ${userEmail} to ${userEmail}.`
  };
}

async function runDigest({ sendEmail = true, userEmail = "", accessToken = "" } = {}) {
  if (!userEmail) throw new Error("A signed-in Gmail user is required.");
  const config = await readUserConfig(userEmail);
  const history = await readUserHistory(userEmail);
  const digest = await generateDigest(config, history);
  const html = renderEmailHtml(digest);
  const text = renderTextDigest(digest);
  let emailResult = { sent: false, previewOnly: true, message: "Preview generated. No email was sent." };

  if (sendEmail && digest.briefingResult?.enhanced) {
    emailResult = await sendGmailFromUser({
      userEmail,
      subject: "Daily News",
      html,
      text,
      accessToken
    });
  } else if (sendEmail && !digest.briefingResult?.enhanced) {
    emailResult = {
      sent: false,
      previewOnly: true,
      message: "The English rewrite did not finish, so a preview was generated but no email was sent."
    };
  }

  history.unshift({ ...digest, emailResult });
  await writeUserHistory(userEmail, history.slice(0, 20));
  return { digest, html, text, emailResult };
}

function currentTimeInZone(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
}

function currentDateKeyInZone(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function generatedOnDateInZone(digest, timezone, dateKey) {
  if (!digest?.generatedAt) return false;
  const generatedAt = new Date(digest.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return false;
  return currentDateKeyInZone(timezone, generatedAt) === dateKey;
}

async function runScheduledDigestForUser(userEmail, { requireSendHour = true } = {}) {
  const config = await readUserConfig(userEmail);

  if (!config.dailySendingEnabled) {
    return {
      userEmail,
      ran: false,
      message: "Skipped. Daily sending is not enabled for this account."
    };
  }

  const timezone = config.timezone || "America/New_York";
  const sendTime = String(config.sendTime || "08:00").slice(0, 5);
  const currentTime = currentTimeInZone(timezone);

  if (requireSendHour && currentTime !== sendTime) {
    return {
      userEmail,
      ran: false,
      message: `Skipped. Current ${timezone} time is ${currentTime}, but send time is ${sendTime}.`
    };
  }

  const tokenResult = await getUserAccessToken(userEmail);
  if (!tokenResult.ok) {
    return {
      userEmail,
      ran: false,
      needsReconnect: true,
      message: tokenResult.message
    };
  }

  const history = await readUserHistory(userEmail);
  const todayKey = currentDateKeyInZone(timezone);
  const alreadySentToday = history.some((digest) =>
    generatedOnDateInZone(digest, timezone, todayKey) && digest.emailResult?.sent
  );

  if (alreadySentToday) {
    return {
      userEmail,
      ran: false,
      message: `Skipped. A scheduled email was already sent for ${todayKey}.`
    };
  }

  const result = await runDigest({ sendEmail: true, userEmail, accessToken: tokenResult.accessToken });
  return {
    userEmail,
    ran: true,
    message: result.emailResult?.message || "Scheduled digest finished.",
    emailResult: result.emailResult,
    digest: result.digest
  };
}

async function runScheduledDigest({ requireSendHour = true } = {}) {
  const users = await readRegisteredUsers();
  if (!users.length) {
    return {
      ran: false,
      message: "No signed-in Gmail users are registered for scheduled sending.",
      results: []
    };
  }

  const results = [];
  for (const userEmail of users) {
    try {
      results.push(await runScheduledDigestForUser(userEmail, { requireSendHour }));
    } catch (error) {
      results.push({
        userEmail,
        ran: false,
        message: error.message || "Scheduled digest failed for this user."
      });
    }
  }

  const ran = results.some((result) => result.ran);
  return {
    ran,
    message: ran ? "Scheduled digest finished for one or more users." : "No user digest was sent.",
    results
  };
}

async function schedulerTick() {
  const minuteKey = new Date().toISOString().slice(0, 16);
  if (lastSchedulerMinute === minuteKey) return;
  lastSchedulerMinute = minuteKey;
  runScheduledDigest({ requireSendHour: true }).catch((error) => console.error("Scheduled digest failed:", error));
}

async function handleApi(req, res) {
  try {
    await dispatchApi(req, res);
  } catch (error) {
    if (res.headersSent) throw error;
    if (error instanceof PayloadTooLargeError) {
      // The request body was not fully read; close the connection so the client
      // stops sending instead of reusing a half-consumed socket.
      res.setHeader("Connection", "close");
      return sendJson(res, 413, { error: error.message });
    }
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { error: "Invalid JSON request body." });
    }
    throw error;
  }
}

async function dispatchApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/auth/google/start") {
    return handleGoogleAuthStart(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
    return handleGoogleAuthCallback(req, res, url);
  }
  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    return sendJson(res, 200, await getSessionResponse(req));
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return handleLogout(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/disconnect") {
    return handleDisconnect(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/config") {
    const session = requireSession(req, res);
    if (!session) return;
    return sendJson(res, 200, await readUserConfig(session.email));
  }
  if (req.method === "PUT" && url.pathname === "/api/config") {
    const session = requireSession(req, res);
    if (!session) return;
    const body = await readRequestBody(req);
    await writeUserConfig(session.email, body);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/history") {
    const session = requireSession(req, res);
    if (!session) return;
    return sendJson(res, 200, await readUserHistory(session.email));
  }
  if (req.method === "POST" && url.pathname === "/api/keywords") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await rateLimit(req, res, { email: session.email, group: "ai" }))) return;
    const body = await readRequestBody(req);
    const categoryName = cleanKeyword(body.categoryName || "");
    const focus = cleanFocus(body.focus || "");
    if (!categoryName && !focus) {
      return sendJson(res, 400, { error: "Category name or focus is required." });
    }
    return sendJson(res, 200, await generateKeywords(categoryName || "Custom topic", focus));
  }
  if (req.method === "POST" && url.pathname === "/api/bullets") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await rateLimit(req, res, { email: session.email, group: "ai" }))) return;
    const body = await readRequestBody(req);
    const paragraph = String(body.paragraph || "").trim();
    if (!paragraph) {
      return sendJson(res, 400, { error: "Paragraph is required." });
    }
    try {
      const result = await convertSummaryToBullets({
        title: String(body.title || "").trim(),
        timestamp: String(body.timestamp || "").trim(),
        paragraph
      });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 502, { error: error.message || "Bullet point conversion failed." });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/translate") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await rateLimit(req, res, { email: session.email, group: "ai" }))) return;
    const body = await readRequestBody(req);
    const text = String(body.text || "").trim();
    if (!text) {
      return sendJson(res, 400, { error: "Text is required." });
    }
    try {
      const result = await translateToChinese({ text });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 502, { error: error.message || "Translation failed." });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!(await rateLimit(req, res, { email: session.email, group: "run" }))) return;
    const body = await readRequestBody(req);
    const result = await runDigest({ sendEmail: body.sendEmail !== false, userEmail: session.email });
    return sendJson(res, 200, result);
  }
  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/cron") {
    const authorization = req.headers.authorization || "";
    const requestSecret = req.headers["x-cron-secret"] || authorization.replace(/^Bearer\s+/i, "");
    if (!isValidCronSecret(requestSecret)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    const result = await runScheduledDigest({ requireSendHour: false });
    return sendJson(res, 200, result);
  }
  sendJson(res, 404, { error: "Not found" });
}

export {
  handleApi,
  runDigest,
  runScheduledDigest,
  convertSummaryToBullets,
  translateToChinese,
  finalizeBriefingCategories,
  findArticlesForCategory,
  extractReadableArticleText,
  getBusinessEvidenceScore,
  hasPaywallSignals,
  inspectFreeReadableArticle,
  isSubscriptionOnlyHost,
  selectFreeReadableArticlesForCategory,
  assertSafeRemoteUrl,
  isPrivateIpAddress,
  isValidCronSecret,
  checkRateLimit,
  readRequestBody,
  PayloadTooLargeError
};

if (IS_DIRECT_RUN) {
  await ensureDataFiles();
  const serverFileUpdatedAt = existsSync(__filename) ? statSync(__filename).mtime.toISOString() : "unknown";

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        await handleApi(req, res);
      } else {
        serveStatic(req, res);
      }
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: error.message || "Server error" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`News Generator is running at http://${HOST}:${PORT}`);
    console.log(`News Generator version ${APP_VERSION}; server.js updated at ${serverFileUpdatedAt}; process started at ${new Date().toISOString()}`);
  });

  setInterval(schedulerTick, 30_000);
}
