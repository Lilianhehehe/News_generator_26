# News Sources

## Purpose

News sources provide candidate articles for each category. The app searches Google News RSS first, then expands to category-matched fallback RSS feeds if there are not enough unique articles.

## Related Files

- `server.js`: fallback feed definitions, Google News search, RSS/Atom parsing, feed fetching, source metadata, freshness filtering, and search query building.
- `docs/features/topic-filtering.md`: explains how candidates are filtered and ranked after fetching.
- `data/history.json`: stores prior articles so fetched articles are not reused too soon.

## Data Flow

1. A category is converted into a Google News RSS query.
2. Google News RSS is fetched with locale parameters for English U.S. results.
3. RSS or Atom XML is parsed into normalized article objects.
4. Articles are filtered for valid publication time within the last 10 days.
5. Topic filtering selects the best non-repeated articles.
6. If the category still needs more items, fallback RSS feeds for that category are fetched.
7. Fallback articles go through the same parsing, freshness, dedupe, and ranking flow.

## Config and Environment

- `NEWS_FEED_TIMEOUT_MS`: fetch timeout for Google News and fallback feeds.
- `NEWS_MAX_AGE_DAYS`: current freshness window of 10 days.
- Google News source priority is currently hard-coded in `server.js`.
- Fallback feed source priority defaults are currently hard-coded in `server.js`.
- Fallback feed URLs and priorities are currently hard-coded by category in `server.js`.

## Edge Cases

- A failed Google News search logs an error and does not stop fallback source attempts.
- Failed fallback feeds are ignored through settled promise results.
- Articles without title or link are removed.
- RSS and Atom feeds have different link and date fields, so parsing handles both formats.
- Google News can return links with original source URLs in `guid` or source metadata.
- Some feeds may include HTML or CDATA in descriptions; parsing strips tags and decodes common XML entities.
- If no unique article is found after expanded search, the app does not repeat old news as filler.

## Testing Notes

- Test RSS parsing with item-based feeds.
- Test Atom parsing with entry-based feeds and alternate links.
- Test XML decoding and tag stripping.
- Test feed fetch timeout behavior.
- Test fallback expansion when Google News returns too few usable articles.
- A future mock harness should pass fixed RSS strings into the parser and fixed article arrays into the selection flow.
