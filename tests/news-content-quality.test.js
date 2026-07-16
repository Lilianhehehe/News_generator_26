import assert from "node:assert/strict";
import test from "node:test";

import * as newsServer from "../server.js";

const { inspectFreeReadableArticle } = newsServer;

function words(count, prefix = "detail") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function inspectHtml(html, options = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => htmlResponse(html);
  try {
    return await inspectFreeReadableArticle({
      title: options.title || "Business update",
      link: options.link || "https://example.com/business-update",
      source: options.source || "Example Business News",
      publishedAt: "2026-07-15T12:00:00.000Z"
    }, {
      companyFocused: options.companyFocused !== false
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("rejects an investor-type gate even when the page has more than 250 words", async () => {
  const html = `
    <html>
      <head><title>Select Your Investor Type | Goldman Sachs Asset Management</title></head>
      <body>
        <main>
          <h1>Select Your Investor Type</h1>
          <section>
            <h2>Institutional Investor</h2>
            <p>You may represent a pension fund, insurance provider, or investment consultant.</p>
          </section>
          <section>
            <h2>Individual Investor</h2>
            <p>You may be a private investor or the client of an investment advisor, wealth manager, or private bank.</p>
          </section>
          <section>
            <h2>Financial Intermediary</h2>
            <p>You may represent a registered investment advisor, broker-dealer, wealth manager, or private bank.</p>
          </section>
          <p>${words(300, "disclaimer")}</p>
        </main>
      </body>
    </html>
  `;

  const result = await inspectHtml(html, {
    title: "US Market Pulse July 2026",
    link: "https://am.gs.com/en-us/advisors/insights/article/market-pulse"
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /gate|landing|article/i);
});

test("rejects a generic market-report overview with no concrete business event", async () => {
  const html = `
    <html>
      <head>
        <meta property="og:type" content="article">
        <title>US Market Pulse July 2026</title>
      </head>
      <body>
        <article>
          <h1>US Market Pulse July 2026</h1>
          <p>The US Market Pulse report reviews recent market trends and economic signals. It covers indicators that investors watch, such as market movements, sector performance, and economic data. The report aims to help readers see which areas show strength or weakness and how that may affect investment choices. It provides a regular view of US market conditions and helps professionals track short-term shifts.</p>
          <p>${words(280, "overview")}</p>
        </article>
      </body>
    </html>
  `;

  const result = await inspectHtml(html, { title: "US Market Pulse July 2026" });

  assert.equal(result.ok, false);
  assert.match(result.reason, /concrete|business|detail/i);
});

test("rejects a long main page when it has no real article signals", async () => {
  const html = `
    <html>
      <head><title>Financial Resources</title></head>
      <body><main><h1>Financial Resources</h1><p>${words(320, "resource")}</p></main></body>
    </html>
  `;

  const result = await inspectHtml(html);

  assert.equal(result.ok, false);
  assert.match(result.reason, /article|content|landing/i);
});

test("rejects a news listing made of short article cards instead of one complete article", async () => {
  const cards = Array.from({ length: 6 }, (_, index) => `
    <article>
      <h2>Market headline ${index + 1}</h2>
      <p>${words(55, `card${index}-`)}</p>
    </article>
  `).join("");
  const html = `<html><body><main>${cards}</main></body></html>`;

  const result = await inspectHtml(html, { companyFocused: false });

  assert.equal(result.ok, false);
  assert.match(result.reason, /readable words|article body|content/i);
});

test("rejects subscription and sign-in reading gates", async () => {
  const html = `
    <html><body><article>
      <p>Sign in to continue reading this article.</p>
      <p>${words(300)}</p>
    </article></body></html>
  `;

  const result = await inspectHtml(html);

  assert.equal(result.ok, false);
  assert.match(result.reason, /paywall|gate/i);
});

test("accepts a free full business article with concrete source-backed facts", async () => {
  const articleBody = [
    "Northstar Systems said on July 15, 2026 that it will cut 4,000 jobs, equal to 8 percent of its workforce.",
    "The layoffs will begin in September 2026 and will mainly affect sales and support teams in New York, London, and Singapore.",
    "The company said the cuts are part of a $600 million cost-reduction plan after quarterly revenue fell 12 percent to $3.2 billion.",
    "Northstar expects to record $180 million in restructuring charges and said customer support response times may be longer during the transition.",
    "The company will keep hiring for cloud security roles and plans to move 500 workers into product and engineering teams.",
    words(260, "reportedfact")
  ].map((paragraph) => `<p>${paragraph}</p>`).join("");
  const html = `
    <html>
      <head>
        <meta property="og:type" content="article">
        <script type="application/ld+json">${JSON.stringify({
          "@type": "NewsArticle",
          headline: "Northstar Systems to cut 4,000 jobs",
          articleBody: articleBody.replace(/<[^>]+>/g, " ")
        })}</script>
      </head>
      <body><article><h1>Northstar Systems to cut 4,000 jobs</h1>${articleBody}</article></body>
    </html>
  `;

  const result = await inspectHtml(html, { title: "Northstar Systems to cut 4,000 jobs" });

  assert.equal(result.ok, true);
  assert.match(result.article.articleText, /4,000 jobs/);
  assert.match(result.article.articleText, /September 2026/);
  assert.match(result.article.articleText, /\$600 million/);
});

test("scores detailed business evidence above generic market language", () => {
  assert.equal(typeof newsServer.getBusinessEvidenceScore, "function");
  const generic = "This report reviews market trends and helps investors understand changing conditions.";
  const detailed = "Northstar will cut 4,000 jobs in September 2026 after revenue fell 12 percent to $3.2 billion.";

  assert.ok(newsServer.getBusinessEvidenceScore(detailed) > newsServer.getBusinessEvidenceScore(generic));
});

test("business selection skips gates and generic reports and returns the concrete free article", async () => {
  assert.equal(typeof newsServer.selectFreeReadableArticlesForCategory, "function");
  const candidates = [
    {
      title: "US Market Pulse July 2026",
      link: "https://example.com/market-pulse",
      source: "Investment Report",
      snippet: "A review of market trends and economic signals.",
      publishedAt: new Date().toISOString(),
      sourcePriority: 5
    },
    {
      title: "Northstar Systems to cut 4,000 jobs in September",
      link: "https://example.com/northstar-layoffs",
      source: "Example Business News",
      snippet: "Northstar announced layoffs after quarterly revenue fell.",
      publishedAt: new Date().toISOString(),
      sourcePriority: 3
    }
  ];
  const genericHtml = `<article><p>The report reviews market conditions and helps investors follow broad changes.</p><p>${words(280, "overview")}</p></article>`;
  const detailedHtml = `<article>
    <p>Northstar Systems announced on July 15, 2026 that it will cut 4,000 jobs, or 8 percent of its workforce.</p>
    <p>The layoffs begin in September and affect sales and support teams in New York, London, and Singapore.</p>
    <p>Quarterly revenue fell 12 percent to $3.2 billion, and the company expects $180 million in restructuring charges.</p>
    <p>${words(260, "reportedfact")}</p>
  </article>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => htmlResponse(
    String(url).includes("market-pulse") ? genericHtml : detailedHtml
  );

  try {
    const selected = await newsServer.selectFreeReadableArticlesForCategory(
      candidates,
      { id: "business", companyFocused: true },
      1,
      { links: new Set(), titles: new Set() },
      { links: new Set(), titles: new Set() },
      new Map()
    );

    assert.equal(selected.length, 1);
    assert.equal(selected[0].link, "https://example.com/northstar-layoffs");
    assert.match(selected[0].articleText, /4,000 jobs/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
