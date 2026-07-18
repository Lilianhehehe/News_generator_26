import assert from "node:assert/strict";
import test from "node:test";

import {
  areKeywordsNearDuplicates,
  buildSearchQuery,
  filterGeneratedKeywords,
  findArticlesForCategory,
  generateKeywords,
  normalizeCategory
} from "../server.js";

test("Google News query uses only the visible Focus keywords", () => {
  const query = buildSearchQuery({
    id: "custom-ai",
    name: "AI",
    focus: "AI regulation, AI chips, healthcare AI",
    keywords: ["hidden legacy term"],
    researchFocused: true,
    companyFocused: true,
    politicalFocused: true
  });

  assert.equal(
    query,
    "(AI regulation OR AI chips OR healthcare AI) when:10d"
  );
  assert.doesNotMatch(query, /paper|publication|company|earnings|politics|hidden legacy term/i);
});

test("Google News query keeps short Focus terms and groups every OR branch", () => {
  const query = buildSearchQuery({
    name: "US finance & stock market",
    focus: "S&P 500, Wall Street, US stocks"
  });

  assert.equal(query, "(S&P 500 OR Wall Street OR US stocks) when:10d");
});

test("an explicitly empty Focus does not fall back to hidden legacy keywords or feeds", async () => {
  const category = {
    name: "AI",
    focus: "",
    keywords: ["hidden legacy term"]
  };
  let googleCalls = 0;
  let fallbackCalls = 0;
  const articles = await findArticlesForCategory(category, {
    searchGoogleNewsFn: async () => {
      googleCalls += 1;
      return [];
    },
    searchFallbackFeedsFn: async () => {
      fallbackCalls += 1;
      return [];
    }
  });

  assert.equal(buildSearchQuery(category), "");
  assert.deepEqual(articles, []);
  assert.equal(googleCalls, 0);
  assert.equal(fallbackCalls, 0);
});

test("near-duplicate detection catches reordered words, aliases, and dates", () => {
  assert.equal(areKeywordsNearDuplicates("AI regulation in US 2026", "US AI policy"), true);
  assert.equal(areKeywordsNearDuplicates("S&P 500", "S&P 500 earnings"), true);
  assert.equal(areKeywordsNearDuplicates("artificial intelligence chips", "AI chips 2026"), true);
  assert.equal(areKeywordsNearDuplicates("AI regulation", "AI chips"), false);
  assert.equal(areKeywordsNearDuplicates("US stocks", "US inflation"), false);
});

test("generated keywords stay short and exclude existing or repeated topics", () => {
  const keywords = filterGeneratedKeywords([
    "US AI policy",
    "AI chips",
    "AI chips 2026",
    "AI funding",
    "robotics",
    "cloud computing",
    "biology research breakthroughs",
    "Nature biology breakthrough papers",
    "this keyword phrase has five words",
    "AI funding updates"
  ], [
    "AI regulation in US 2026",
    "artificial intelligence chips"
  ]);

  assert.deepEqual(keywords, ["AI funding", "robotics", "cloud computing", "biology research breakthroughs"]);
  assert.ok(keywords.every((keyword) => keyword.split(/\s+/).length <= 3));
});

test("saved suggestions for every topic are normalized to the global short rule", () => {
  const category = normalizeCategory({
    id: "custom-biology",
    name: "Frontier Biology Research",
    focus: "cell biology, gene editing",
    keywordMode: "auto",
    generatedKeywords: [
      "cell biology",
      "Nature biology breakthrough papers",
      "Cell Press cell biology studies",
      "gene editing"
    ]
  });

  assert.deepEqual(category.generatedKeywords, ["cell biology", "gene editing"]);
});

test("keyword model prompt requests short terms and names every excluded topic", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        keywords: [
          "US AI policy",
          "AI chip",
          "robotics",
          "cloud computing",
          "AI funding",
          "data centers",
          "enterprise AI",
          "AI safety"
        ]
      })
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await generateKeywords("AI", "AI regulation in US 2026", {
      apiKey: "test-key",
      excludedKeywords: ["AI chips"]
    });
    const userText = requestBody.input[0].content[0].text;

    assert.match(requestBody.instructions, /1 to 3 words only/i);
    assert.match(requestBody.instructions, /every topic, including new custom topics/i);
    assert.match(requestBody.instructions, /synonym.*closely related/i);
    assert.match(userText, /AI regulation in US 2026/);
    assert.match(userText, /AI chips/);
    assert.ok(result.keywords.includes("robotics"));
    assert.ok(!result.keywords.some((keyword) => areKeywordsNearDuplicates(keyword, "AI regulation in US 2026")));
    assert.ok(!result.keywords.some((keyword) => areKeywordsNearDuplicates(keyword, "AI chips")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
