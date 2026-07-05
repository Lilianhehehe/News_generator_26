# Topic Filtering

## Purpose

Topic filtering decides which categories run, how many items each category needs, which articles are fresh, which articles are repeats, and which candidates are most relevant.

## Related Files

- `server.js`: category defaults, `normalizeCategory`, `clampItemCount`, freshness checks, dedupe helpers, recent-history memory, scoring, ranking, and selection.
- `public/app.js`: reads category names, enabled state, item counts, focus text, and generated keyword suggestions from the settings form.
- `public/index.html`: contains the topic controls, including the simple Focus field and advanced keyword suggestion controls.
- `data/config.json`: local saved categories and topic settings.

## Data Flow

1. The app reads config.
2. Categories are normalized against defaults.
3. Disabled categories are skipped.
4. The requested item count is clamped between 1 and 10.
5. Search keywords are parsed from the topic's Focus text.
6. Search queries are built from those Focus keywords and focus flags.
7. Candidate articles are deduplicated.
8. Candidates must be from the last 10 days.
9. Candidates already used in the last 10 days are removed.
10. Candidates already selected in the current run are removed.
11. Remaining candidates are scored and ranked.
12. The top articles are selected up to the requested item count.

## Config and Environment

- Category defaults are currently hard-coded in `server.js`.
- Each category can define `id`, `name`, `enabled`, `itemCount`, `focus`, `generatedKeywords`, `generatedKeywordsStale`, legacy `keywords`, and focus flags.
- `focus` is the source of truth for search keywords.
- `generatedKeywords` are suggestions only. They do not affect search unless the user adds them to Focus.
- The legacy `keywords` field is kept as a compatibility mirror for older saved topics and is used to seed Focus when a saved topic has no Focus text.
- Supported focus flags include `researchFocused`, `companyFocused`, and `politicalFocused`.
- Research-focused topics still add research terms such as paper, publication, study, research article, and journal, but they do not override Focus keywords.
- `NEWS_MAX_AGE_DAYS` is currently fixed at 10 days in `server.js`.
- The UI allows item counts from 1 to 10.
- The main topic UI shows a natural-language Focus field. Advanced search settings show selectable generated keyword suggestions and an Add to focus action.

## Edge Cases

- Categories missing newer focus flags are migrated from defaults when possible.
- Categories saved with only legacy `keywords` seed the Focus field so existing searches do not change.
- Generated keyword suggestions can be stale without changing search behavior; only Focus controls search.
- Users can select multiple generated keyword suggestions, cancel selection by clicking again, and add the selected suggestions to Focus in one action.
- Invalid item counts fall back to 1.
- Articles without valid publication dates are rejected.
- Future-dated articles are rejected.
- Links are normalized before repeat checks so tracking parameters do not create false unique items.
- Titles are normalized to catch duplicates with source suffixes.
- If focused categories do not have enough positive-score items, ranking can fall back to the best available candidates.
- The current run memory prevents the same article from appearing in multiple categories.

## Testing Notes

- Test item count clamping with invalid, low, and high values.
- Test title and URL dedupe with tracking parameters and source suffixes.
- Test history-based repeat filtering for articles used within the last 10 days.
- Test that older history entries do not block new selection.
- Test focused scoring with research, company, and political categories.
- Test that old saved topics with only `keywords` seed Focus and still search with those terms.
- Test selecting multiple generated keyword suggestions, deselecting one, and adding the selected set to Focus.
- Test that generated keyword suggestions not added to Focus are not used for search.
- Test editing Focus manually and confirming the digest uses Focus terms.
