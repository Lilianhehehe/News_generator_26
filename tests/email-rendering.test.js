import test from "node:test";
import assert from "node:assert/strict";

import { renderEmailHtml } from "../server.js";

test("email HTML uses the Morning Desk visual system and readable body copy", () => {
  const html = renderEmailHtml({
    generatedAt: "2026-07-17T17:24:23.000Z",
    categories: [{
      name: "Frontier Neuroscience Research",
      articles: [{
        title: "Listening to the body's signals",
        link: "https://example.com/story?section=science&edition=daily",
        summary: "A clear <summary> with useful & specific details.",
        publishedAt: "2026-07-17T16:00:00.000Z"
      }]
    }]
  });

  assert.match(html, /background:#fbfaf7/);
  assert.match(html, /max-width:760px/);
  assert.match(html, /border-bottom:1\.5px solid #20241f/);
  assert.match(html, /color:#8c4a3a/);
  assert.match(html, /color:#39463b/);
  assert.match(html, /color:#555850[^>]+font-size:15px[^>]+line-height:1\.75/);
  assert.match(html, /font-family:Georgia,'Times New Roman',serif/);
  assert.match(html, /Listening to the body&#39;s signals/);
  assert.match(html, /section=science&amp;edition=daily/);
  assert.match(html, /A clear &lt;summary&gt; with useful &amp; specific details\./);
  assert.doesNotMatch(html, /#f7f4ea|#102c29|#165d59/);
});

test("email HTML gives empty categories the matching editorial treatment", () => {
  const html = renderEmailHtml({
    generatedAt: "2026-07-17T17:24:23.000Z",
    categories: [{
      name: "Frontier Biology Research",
      articles: [],
      error: "No new <articles> were found."
    }]
  });

  assert.match(html, /Frontier Biology Research/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /No new &lt;articles&gt; were found\./);
});
