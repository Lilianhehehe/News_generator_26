import assert from "node:assert/strict";
import test from "node:test";

import {
  filterFallbackArticlesByFocus,
  getFallbackFeedsForCategory,
  getFallbackProfileForCategory
} from "../server.js";

test("custom AI and finance topics receive matching fallback RSS profiles", () => {
  const ai = {
    id: "category-ai",
    name: "AI",
    focus: "AI regulation, AI chips, healthcare AI"
  };
  const finance = {
    id: "category-finance",
    name: "US finance & stock market",
    focus: "S&P 500, Wall Street, US stocks"
  };

  assert.equal(getFallbackProfileForCategory(ai), "technology");
  assert.equal(getFallbackProfileForCategory(finance), "business");
  assert.ok(getFallbackFeedsForCategory(ai).length > 0);
  assert.ok(getFallbackFeedsForCategory(finance).length > 0);
});

test("every unrecognized custom topic receives the general fallback RSS profile", () => {
  const custom = {
    id: "category-unrecognized",
    name: "Neighborhood changes",
    focus: "urban farming, local parks"
  };

  assert.equal(getFallbackProfileForCategory(custom), "general");
  const feeds = getFallbackFeedsForCategory(custom);
  assert.ok(feeds.length > 0);
  assert.ok(feeds.every((feed) => /^https:\/\//.test(feed.url)));
});

test("custom fallback candidates must match a visible Focus topic", () => {
  const category = {
    id: "category-ai",
    name: "AI",
    focus: "AI regulation, AI chips"
  };
  const articles = [
    {
      title: "US issues new rules for artificial intelligence chips",
      source: "MIT News AI",
      snippet: "The regulation changes which processors companies may export."
    },
    {
      title: "Robotics team opens a new laboratory",
      source: "Technology Daily",
      snippet: "The lab will study industrial machines."
    },
    {
      title: "Football club signs a new goalkeeper",
      source: "World News",
      snippet: "The player signed a four-year contract."
    }
  ];

  const matched = filterFallbackArticlesByFocus(articles, category);
  assert.deepEqual(matched.map((article) => article.title), [
    "US issues new rules for artificial intelligence chips"
  ]);
});

test("built-in topics keep their dedicated fallback RSS lists", () => {
  const feeds = getFallbackFeedsForCategory({
    id: "neuroscience",
    name: "Frontier Neuroscience Research",
    focus: "brain research"
  });

  assert.ok(feeds.some((feed) => feed.name === "Nature Neuroscience"));
  assert.ok(feeds.some((feed) => feed.name === "MIT News Neuroscience"));
});
