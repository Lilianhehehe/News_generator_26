import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tls from "node:tls";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadLocalEnv(path.join(__dirname, ".env.local"));

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120_000);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 14_000);
const OPENAI_MAX_REWRITE_ATTEMPTS = Number(process.env.OPENAI_MAX_REWRITE_ATTEMPTS || 4);
const NEWS_MAX_AGE_DAYS = 10;
const NEWS_MAX_AGE_MS = NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
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
  "- Each news summary must be exactly 5 or 6 short sentences.",
  "- The summary must be long enough to help the reader understand the news.",
  "- Do not write only 2-3 general sentences.",
  "- For each news item, explain what happened, who or what is involved, why it matters, what is new or important, and what the reader should understand from it.",
  "- The 5-6 sentences should explain: what happened; who or what is involved; what method, decision, event, or system is involved; what the key finding, result, or change is; why it matters; and what it may affect, help with, or lead to next if the article supports it.",
  "- Internally cover what happened, key details, why it matters, what is new or useful, and what to watch next if the article supports it.",
  "- Be specific. Avoid vague summaries such as 'This study may help future research' or 'This policy may affect the market.'",
  "- Explain reasons in simple and concrete language.",
  "- Explain the news directly. Do not write filler such as 'the article was published by,' 'the report says,' 'according to the source,' or 'the source reported.'",
  "- Do not mention the source name or publication time inside the summary.",
  "",
  "Topic-specific detail rules:",
  "- For business, finance, or economy news, focus on company names, product names, market changes, numbers or prices, policy details, business impact, and examples mentioned in the article.",
  "- For biology, neuroscience, medicine, or research news, focus on the study question, what researchers found, what is new or innovative, why the finding matters, possible future uses, how it may help future research, and limits or open questions mentioned in the article.",
  "- For policy, law, or politics news, focus on what policy, law, or decision changed, who is affected, what may happen next, why the change matters, and what conflict or debate is involved.",
  "- For technology news, focus on what the technology does, what problem it tries to solve, what is new about it, who may use it, and what limits, risks, or open questions remain.",
  "- For international news, focus on which countries or groups are involved, what happened, and how it may affect relationships, security, trade, or public opinion.",
  "",
  "Evidence rules:",
  "- Use only information supported by the article data.",
  "- Do not invent company names, research results, numbers, prices, future uses, political effects, quotes, examples, reactions, causes, or background context.",
  "- If a detail is not in the article data, skip that detail.",
  "- Do not write missing-detail disclaimers such as 'The article does not give specific company names.'",
  "- The goal is to include useful supported details, not to list missing information.",
  "",
  "Final self-check before returning:",
  "- Is the whole output in English?",
  "- Is there any Chinese text left?",
  "- Does each summary have exactly 5 or 6 sentences?",
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
  sendTime: "08:00",
  timezone: "America/New_York",
  categories: [
    {
      id: "neuroscience",
      name: "Frontier Neuroscience Research",
      enabled: true,
      itemCount: 1,
      researchFocused: true,
      keywords: [
        "neuroscience paper",
        "neuroscience publication",
        "Nature Neuroscience",
        "Neuron",
        "Science neuroscience",
        "Cell neuroscience"
      ]
    },
    {
      id: "biology",
      name: "Frontier Biology Research",
      enabled: true,
      itemCount: 1,
      researchFocused: true,
      keywords: [
        "biology paper",
        "biology publication",
        "Nature biology",
        "Science biology",
        "Cell biology",
        "PNAS biology"
      ]
    },
    {
      id: "us_major_news",
      name: "Major U.S. Political News",
      enabled: true,
      itemCount: 1,
      politicalFocused: true,
      keywords: [
        "US politics breaking news",
        "White House Congress",
        "Trump administration",
        "Supreme Court",
        "US election policy"
      ]
    },
    {
      id: "china_major_news",
      name: "Major China Political News",
      enabled: true,
      itemCount: 1,
      politicalFocused: true,
      keywords: [
        "China politics",
        "Chinese government policy",
        "Beijing official statement",
        "Taiwan China diplomacy",
        "China foreign policy"
      ]
    },
    {
      id: "world_politics",
      name: "World Politics",
      enabled: true,
      itemCount: 1,
      keywords: ["world politics", "geopolitics", "international politics"]
    },
    {
      id: "world_economy",
      name: "Global Company News",
      enabled: true,
      itemCount: 3,
      companyFocused: true,
      keywords: [
        "major companies earnings",
        "global companies",
        "Big Tech earnings",
        "merger acquisition",
        "company layoffs",
        "supply chain company news",
        "market leaders regulation"
      ]
    }
  ]
};

let lastSchedulerMinute = "";

async function ensureDataFiles() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    await writeJson(CONFIG_PATH, defaultConfig);
  }
  if (!existsSync(HISTORY_PATH)) {
    await writeJson(HISTORY_PATH, []);
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readConfig() {
  const saved = await readJson(CONFIG_PATH, defaultConfig);
  const savedCategories = Array.isArray(saved.categories) ? saved.categories : defaultConfig.categories;
  const categories = savedCategories.map((category) => normalizeCategory(category, saved.maxItemsPerCategory));
  return {
    ...defaultConfig,
    ...saved,
    categories
  };
}

function normalizeCategory(category, fallbackCount = 1) {
  const defaults = defaultConfig.categories.find((item) => item.id === category.id) || {};
  const isMigratingFocusedCategory = (defaults.researchFocused || defaults.companyFocused)
    && !("researchFocused" in category)
    && !("companyFocused" in category);
  const isMigratingPoliticalCategory = defaults.politicalFocused && !("politicalFocused" in category);
  return {
    ...defaults,
    ...category,
    keywords: (isMigratingFocusedCategory || isMigratingPoliticalCategory)
      ? defaults.keywords
      : (category.keywords || defaults.keywords || []),
    itemCount: clampItemCount(category.itemCount ?? defaults.itemCount ?? fallbackCount ?? 1)
  };
}

function clampItemCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(count, 1), 10);
}

async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readRequestBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
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
    .replace(/&#39;/g, "'");
}

function getTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(decodeXml(match[1])) : "";
}

function parseRss(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items.map(([, raw]) => ({
    title: getTag(raw, "title"),
    link: getTag(raw, "link"),
    source: getTag(raw, "source") || "Google News",
    publishedAt: getTag(raw, "pubDate"),
    snippet: getTag(raw, "description")
  })).filter((item) => item.title && item.link);
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

async function searchGoogleNews(query, limit) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en"
  });
  const response = await fetch(`https://news.google.com/rss/search?${params.toString()}`, {
    headers: { "user-agent": "PersonalNewsGenerator/0.1" }
  });
  if (!response.ok) {
    throw new Error(`Google News returned ${response.status}`);
  }
  return parseRss(await response.text()).filter((article) => isFreshArticle(article)).slice(0, limit);
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

function rankArticlesForCategory(articles, category, limit) {
  const ranked = dedupeArticles(articles)
    .map((article, index) => ({ article, index, score: scoreArticle(article, category) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (category.researchFocused || category.companyFocused) {
    const focused = ranked.filter((item) => item.score > 0).map((item) => item.article);
    if (focused.length >= limit) return focused.slice(0, limit);
  }

  return ranked.map((item) => item.article).slice(0, limit);
}

function buildSearchQuery(category) {
  const keywords = (category.keywords || []).filter(Boolean);
  const joinedKeywords = keywords.length ? keywords.join(" OR ") : getCategoryDisplayName(category);

  if (category.researchFocused) {
    if (category.id === "neuroscience") {
      return `(site:nature.com neuroscience OR site:cell.com neuron OR site:science.org neuroscience OR site:pnas.org neuroscience) when:${NEWS_MAX_AGE_DAYS}d`;
    }
    if (category.id === "biology") {
      return `(site:nature.com biology OR site:science.org biology OR site:cell.com biology OR site:pnas.org biology) when:${NEWS_MAX_AGE_DAYS}d`;
    }
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
    const key = article.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function splitSummarySentences(value = "") {
  const protectedText = String(value)
    .replace(/\bU\.S\./g, "US")
    .replace(/\bU\.K\./g, "UK")
    .replace(/\bE\.U\./g, "EU")
    .replace(/\bD\.C\./g, "DC")
    .replace(/\be\.g\./gi, "eg")
    .replace(/\bi\.e\./gi, "ie")
    .replace(/\bDr\./g, "Dr")
    .replace(/\bMr\./g, "Mr")
    .replace(/\bMs\./g, "Ms")
    .replace(/\bMrs\./g, "Mrs")
    .replace(/\bProf\./g, "Prof");

  return (protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?=\s+|$)|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

function countSummarySentences(value = "") {
  return splitSummarySentences(value).length;
}

function hasSourceOrTimeFiller(value = "") {
  return /\b(?:the\s+)?(?:article|report|story|piece|source)\s+(?:was\s+)?(?:published|reported|written|says|said|states|stated|notes|noted|comes\s+from)\b|\baccording\s+to\s+(?:the\s+)?(?:article|report|story|piece|source|publisher)\b|\bpublished\s+(?:by|in|on)\b|\breported\s+by\b/iu.test(String(value));
}

function getGeneratedArticleIssues(article) {
  const issues = [];
  const title = normalizeEnglishTitle(article?.englishTitle);
  const summary = normalizeEnglishSummary(article?.englishSummary);
  const sentenceCount = countSummarySentences(summary);

  if (!title) issues.push("missing English title");
  if (!summary) issues.push("missing English summary");
  if (containsChineseText(title) || containsChineseText(summary)) {
    issues.push("contains Chinese text");
  }
  if (sentenceCount < 5) {
    issues.push(`summary has ${sentenceCount} sentences; it must have at least 5 and no more than 6 sentences`);
  }
  if (sentenceCount > 6) {
    issues.push(`summary has ${sentenceCount} sentences; it must have at least 5 and no more than 6 sentences`);
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
      link: article.link
    }))
  );

  if (!apiKey || articlesForModel.length === 0) {
    if (!apiKey) {
      for (const category of digest.categories) {
        category.articles = [];
        category.error = "OPENAI_API_KEY is not set, so no validated 5-6 sentence summaries were generated.";
      }
    }
    return {
      digest,
      briefingResult: {
        enhanced: false,
        message: apiKey
          ? "No articles were available to rewrite."
          : "OPENAI_API_KEY is not set. No validated 5-6 sentence summaries were generated."
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
                    "englishSummary must be one natural English paragraph with at least 5 and no more than 6 sentences. This is a hard rule.",
                    "Each sentence must add useful information. Do not add filler sentences just to reach 5 sentences.",
                    "The 5-6 sentences should explain: 1. what happened; 2. who or what is involved; 3. what method, decision, event, or system is involved; 4. what the key finding, result, or change is; 5. why it matters; 6. what it may affect, help with, or lead to next, if supported by the article.",
                    "Do not use labels or bullet points.",
                    "Use only the title, source, date, and snippet below as evidence.",
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

    const byKey = new Map(
      (parsed.articles || [])
        .filter(isValidGeneratedArticle)
        .map((article) => [getArticleKey(article), article])
    );
    let hiddenCount = 0;

    for (const category of digest.categories) {
      const validatedArticles = [];
      for (const article of category.articles) {
        const generated = byKey.get(`${category.id}|${article.link}`);
        if (!generated) {
          hiddenCount += 1;
          continue;
        }
        validatedArticles.push({
          ...article,
          originalTitle: article.title,
          title: normalizeEnglishTitle(generated.englishTitle) || fallbackEnglishTitle(article),
          summary: normalizeEnglishSummary(generated.englishSummary)
        });
      }
      category.articles = validatedArticles;
      if (!category.articles.length) {
        category.error = "No validated 5-6 sentence summary was generated for this category.";
      }
    }

    return {
      digest,
      briefingResult: {
        enhanced: true,
        message: hiddenCount
          ? `English briefing generated with ${OPENAI_MODEL}. ${hiddenCount} item(s) failed the 5-6 sentence validation and were hidden.`
          : `English briefing generated with ${OPENAI_MODEL}.`
      }
    };
  } catch (error) {
    for (const category of digest.categories) {
      category.articles = [];
      category.error = "No validated 5-6 sentence summaries were generated.";
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

async function generateDigest(config) {
  const enabledCategories = config.categories.filter((category) => category.enabled);
  const digest = {
    generatedAt: new Date().toISOString(),
    briefingResult: { enhanced: false, message: "English rewrite has not run yet." },
    categories: []
  };

  for (const category of enabledCategories) {
    const itemCount = clampItemCount(category.itemCount || config.maxItemsPerCategory || 1);
    const query = buildSearchQuery(category);
    const searchLimit = category.researchFocused || category.companyFocused
      ? Math.min(Math.max(itemCount * 8, 8), 30)
      : itemCount;
    try {
      const articles = rankArticlesForCategory(await searchGoogleNews(query, searchLimit), category, itemCount);
      digest.categories.push({
        id: category.id,
        name: getCategoryDisplayName(category),
        keywords: category.keywords || [],
        itemCount,
        researchFocused: Boolean(category.researchFocused),
        companyFocused: Boolean(category.companyFocused),
        politicalFocused: Boolean(category.politicalFocused),
        articles: articles.map((article) => ({
          ...article,
          originalTitle: article.title,
          summary: summarizeArticle(article)
        }))
      });
    } catch (error) {
      digest.categories.push({
        id: category.id,
        name: getCategoryDisplayName(category),
        keywords: category.keywords || [],
        itemCount,
        researchFocused: Boolean(category.researchFocused),
        companyFocused: Boolean(category.companyFocused),
        politicalFocused: Boolean(category.politicalFocused),
        articles: [],
        error: error.message || "Search failed."
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

function smtpRead(socket, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP response timed out"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      data += chunk.toString("utf8");
      if (/(^|\r?\n)\d{3} /.test(data)) {
        cleanup();
        resolve(data);
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function smtpCommand(socket, command) {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!/^[23]/.test(response)) {
    throw new Error(`SMTP failed: ${response.trim()}`);
  }
  return response;
}

async function sendGmail({ from, to, subject, html, text }) {
  const user = from || process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !password) {
    return {
      sent: false,
      previewOnly: true,
      message: "The sender email or GMAIL_APP_PASSWORD is not set. A preview was generated, but no email was sent."
    };
  }

  const socket = tls.connect(465, "smtp.gmail.com", { servername: "smtp.gmail.com" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Gmail connection timed out"));
    }, 15_000);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
    socket.once("secureConnect", () => clearTimeout(timer));
    socket.once("error", () => clearTimeout(timer));
  });
  await smtpRead(socket);
  await smtpCommand(socket, "EHLO localhost");
  await smtpCommand(socket, "AUTH LOGIN");
  await smtpCommand(socket, Buffer.from(user).toString("base64"));
  await smtpCommand(socket, Buffer.from(password).toString("base64"));
  await smtpCommand(socket, `MAIL FROM:<${user}>`);
  await smtpCommand(socket, `RCPT TO:<${to}>`);
  await smtpCommand(socket, "DATA");

  const boundary = `news-${Date.now()}`;
  const message = [
    `From: ${user}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
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
    `--${boundary}--`,
    "."
  ].join("\r\n");

  await smtpCommand(socket, message);
  await smtpCommand(socket, "QUIT");
  socket.end();
  return { sent: true, previewOnly: false, message: "Email sent." };
}

async function runDigest({ sendEmail = true } = {}) {
  const config = await readConfig();
  const digest = await generateDigest(config);
  const html = renderEmailHtml(digest);
  const text = renderTextDigest(digest);
  let emailResult = { sent: false, previewOnly: true, message: "Preview generated. No email was sent." };

  if (sendEmail && config.recipientEmail && digest.briefingResult?.enhanced) {
    emailResult = await sendGmail({
      from: config.senderEmail,
      to: config.recipientEmail,
      subject: "Daily News",
      html,
      text
    });
  } else if (sendEmail && config.recipientEmail && !digest.briefingResult?.enhanced) {
    emailResult = {
      sent: false,
      previewOnly: true,
      message: "The English rewrite did not finish, so a preview was generated but no email was sent."
    };
  }

  const history = await readJson(HISTORY_PATH, []);
  history.unshift({ ...digest, emailResult });
  await writeJson(HISTORY_PATH, history.slice(0, 20));
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

async function schedulerTick() {
  const config = await readConfig();
  const minuteKey = new Date().toISOString().slice(0, 16);
  if (lastSchedulerMinute === minuteKey) return;
  if (currentTimeInZone(config.timezone || "America/New_York") === config.sendTime) {
    lastSchedulerMinute = minuteKey;
    runDigest({ sendEmail: true }).catch((error) => console.error("Scheduled digest failed:", error));
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/config") {
    return sendJson(res, 200, await readConfig());
  }
  if (req.method === "PUT" && url.pathname === "/api/config") {
    const body = await readRequestBody(req);
    await writeJson(CONFIG_PATH, { ...defaultConfig, ...body });
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/history") {
    return sendJson(res, 200, await readJson(HISTORY_PATH, []));
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readRequestBody(req);
    const result = await runDigest({ sendEmail: body.sendEmail !== false });
    return sendJson(res, 200, result);
  }
  sendJson(res, 404, { error: "Not found" });
}

await ensureDataFiles();

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
});

setInterval(schedulerTick, 30_000);
