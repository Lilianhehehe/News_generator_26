import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("keyword suggestions are generated only from the explicit button", () => {
  assert.doesNotMatch(appSource, /scheduleKeywordGeneration/);
  assert.doesNotMatch(appSource, /(?:nameInput|focusInput)\.addEventListener\("blur"/);
  assert.match(
    appSource,
    /generateKeywordsButton\.addEventListener\("click", \(\) => \{\s*generateKeywordsForCategory\(node\);\s*\}\);/
  );
});

test("keyword chips only toggle selection", () => {
  assert.match(
    appSource,
    /\.generated-keyword-list"\)\.addEventListener\("click", \(event\) => \{[\s\S]*?toggleKeywordSelection\(node, chip\.dataset\.keywordIndex\);[\s\S]*?\}\);/
  );
});

test("edited suggestions keep their internal stale state without showing a warning chip", () => {
  assert.match(appSource, /generatedKeywordsStale/);
  assert.doesNotMatch(appSource, /keyword-chip stale/);
  assert.doesNotMatch(appSource, /Suggestions outdated/);
  assert.doesNotMatch(appSource, /Will refresh before search/);
  assert.doesNotMatch(stylesSource, /\.keyword-chip\.stale/);
});
