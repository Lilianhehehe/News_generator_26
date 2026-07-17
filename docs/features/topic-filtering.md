# Topic Filtering

## Purpose

Topic filtering decides which categories run, how many items each category needs, which articles are fresh, which articles are repeats, and which candidates are most relevant.

## Related Files

- `server.js`: category defaults, `normalizeCategory`, `clampItemCount`, freshness checks, dedupe helpers, recent-history memory, scoring, ranking, and selection.
- `api/keywords.js`: Vercel serverless entrypoint for generated keyword suggestions.
- `public/app.js`: reads category names, enabled state, item counts, focus text, and generated keyword suggestions from the settings form.
- `public/index.html`: contains the Morning Desk topic card template, including the Focus field and advanced keyword controls.
- `docs/features/web-interface.md`: documents the presentation and responsive behavior of those controls.
- `data/config.json`: local saved categories and topic settings.

## Data Flow

1. The app reads config.
2. Categories are normalized against defaults.
3. Disabled categories are skipped.
4. The requested item count is clamped between 1 and 10.
5. Search keywords are parsed from the topic's Focus text.
6. Search queries group the visible Focus keywords with `OR` and add only the 10-day freshness operator.
7. Candidate articles are deduplicated.
8. Candidates must be from the last 10 days.
9. Candidates already used in the last 10 days are removed.
10. Candidates already selected in the current run are removed.
11. Remaining candidates are scored and ranked for topical relevance.
12. Custom-category fallback RSS candidates must match the visible Focus before selection.
13. Publisher pages must pass the free full-article content check.
14. Company-focused candidates must contain a concrete business event and verifiable details. Passing candidates in each checked batch are ordered by business evidence score.
15. The top qualified articles are selected up to the requested item count.

## Config and Environment

- Category defaults are currently hard-coded in `server.js`.
- Each category can define `id`, `name`, `enabled`, `itemCount`, `focus`, `generatedKeywords`, `generatedKeywordsStale`, legacy `keywords`, and focus flags.
- `focus` is the source of truth for search keywords.
- `generatedKeywords` are suggestions only. They do not affect search unless the user adds them to Focus.
- Search does not add the topic name or hidden research, company, or political terms. Focus flags affect ranking and validation only.
- The legacy `keywords` field is kept as a compatibility mirror for older saved topics and is used to seed Focus when a saved topic has no Focus text.
- Supported focus flags include `researchFocused`, `companyFocused`, and `politicalFocused`.
- Generated suggestions must contain one to four words. Regeneration excludes current Focus terms and the previous suggestion set.
- Keyword generation is manual. Only the Generate keywords or Regenerate keywords button calls the keyword API; typing, field blur, suggestion selection, and Add to focus do not regenerate suggestions.
- The backend rejects exact and near duplicates after generation, including reordered phrases, common aliases, and versions that differ only by a year. It can return fewer suggestions instead of repeating a topic.
- `NEWS_MAX_AGE_DAYS` is currently fixed at 10 days in `server.js`.
- The UI allows item counts from 1 to 10.
- The main topic UI shows Focus as a comma-separated keyword textarea. Advanced Setting contains selectable generated keyword suggestions and an Add to focus action.

## Edge Cases

- Categories missing newer focus flags are migrated from defaults when possible.
- Categories saved with only legacy `keywords` seed the Focus field so existing searches do not change.
- An explicitly empty Focus remains empty and skips all source searches for that topic; it does not restore defaults or run fallback feeds.
- Generated keyword suggestions can be marked outdated without changing search behavior; they stay unchanged until manual regeneration, and only Focus controls search.
- Regenerating suggestions does not remove or rewrite Focus. Old suggestions and Focus terms are sent as exclusions so the replacement set covers different subtopics.
- Users can select multiple generated keyword suggestions, cancel selection by clicking again, and add the selected suggestions to Focus in one action.
- Invalid item counts fall back to 1.
- Articles without valid publication dates are rejected.
- Future-dated articles are rejected.
- Links are normalized before repeat checks so tracking parameters do not create false unique items.
- Titles are normalized to catch duplicates with source suffixes.
- If focused categories do not have enough positive-score items, ranking can fall back to the best available candidates.
- Company-focused topics reject generic report descriptions and broad market language that lack a concrete event and source-backed details.
- Business evidence scoring rewards concrete actions, counts, money amounts, percentages, dates, quarters, financial measures, and stated impacts. It affects ordering only after the page passes free full-article validation.
- The current run memory prevents the same article from appearing in multiple categories.
- Random custom category IDs do not disable fallback search; source profiles are inferred from the topic name and Focus, with General as the final fallback.

## Testing Notes

- Test item count clamping with invalid, low, and high values.
- Test title and URL dedupe with tracking parameters and source suffixes.
- Test history-based repeat filtering for articles used within the last 10 days.
- Test that older history entries do not block new selection.
- Test focused scoring with research, company, and political categories.
- Test that old saved topics with only `keywords` seed Focus and still search with those terms.
- Test selecting multiple generated keyword suggestions, deselecting one, and adding the selected set to Focus.
- Test that editing or leaving Topic/Focus and clicking a suggestion does not regenerate keywords; only the explicit generation button should call the API.
- Test that generated keyword suggestions not added to Focus are not used for search.
- Test editing Focus manually and confirming the digest uses Focus terms.
- Test that search queries contain only the visible Focus keywords plus `when:10d`, even when focus flags are enabled.
- Test that generated suggestions contain at most four words and exclude exact or near duplicates from Focus and the prior suggestion set.
- Test custom fallback profile inference and Focus matching before RSS candidates are selected.
- Run `npm test` to verify that company-focused selection skips gates and generic reports and chooses a concrete free article.
- On Vercel, test that `POST /api/keywords` reaches the shared handler instead of returning 404.
