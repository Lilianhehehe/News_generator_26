# Topic Filtering

## Purpose

Topic filtering decides which categories run, how many items each category needs, which articles are fresh, which articles are repeats, and which candidates are most relevant.

## Related Files

- `server.js`: category defaults, `normalizeCategory`, `clampItemCount`, freshness checks, dedupe helpers, recent-history memory, scoring, ranking, and selection.
- `public/app.js`: reads category names, enabled state, item counts, and keywords from the settings form.
- `public/index.html`: contains the topic controls.
- `data/config.json`: local saved categories and topic settings.

## Data Flow

1. The app reads config.
2. Categories are normalized against defaults.
3. Disabled categories are skipped.
4. The requested item count is clamped between 1 and 10.
5. Search queries are built from category keywords and focus flags.
6. Candidate articles are deduplicated.
7. Candidates must be from the last 10 days.
8. Candidates already used in the last 10 days are removed.
9. Candidates already selected in the current run are removed.
10. Remaining candidates are scored and ranked.
11. The top articles are selected up to the requested item count.

## Config and Environment

- Category defaults are currently hard-coded in `server.js`.
- Each category can define `id`, `name`, `enabled`, `itemCount`, `keywords`, and focus flags.
- Supported focus flags include `researchFocused`, `companyFocused`, and `politicalFocused`.
- `NEWS_MAX_AGE_DAYS` is currently fixed at 10 days in `server.js`.
- The UI allows item counts from 1 to 10.

## Edge Cases

- Categories missing newer focus flags are migrated from defaults when possible.
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
