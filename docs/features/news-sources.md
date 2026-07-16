# News Sources

## Purpose

News sources provide candidate articles for each category. The app searches Google News first, then expands to category-matched fallback RSS feeds when it still needs more qualified articles.

## Related Files

- `server.js`: fallback feed definitions, Google News search, RSS/Atom parsing, feed fetching, source metadata, freshness filtering, and search query building.
- `docs/features/topic-filtering.md`: explains how candidates are filtered and ranked after fetching.
- `data/history.json`: stores prior articles so fetched articles are not reused too soon.

## Data Flow

1. A category is converted into a Google News RSS query.
2. Google News RSS is fetched with locale parameters for English U.S. results, and RSS or Atom XML is parsed into normalized article objects.
3. Articles are filtered for valid publication time within the last 10 days.
4. Topic filtering ranks the best non-repeated candidates.
5. Ranked candidates are opened in small concurrent batches. Redirects are followed to the publisher page. Current encoded Google News links are resolved through Google's article lookup response before the publisher page is fetched.
6. Known subscription-first hosts, paywalls, sign-in or registration gates, investor-type selectors, report-download landing pages, non-HTML pages, and unresolved Google News pages are rejected.
7. A page must expose one verifiable article body through article JSON-LD, an `<article>` element, or an article-marked `<main>` with several substantive paragraphs. Text from multiple short article cards is not combined to pass the length check.
8. Company-focused categories also require a concrete business event plus source-backed details such as a count, amount, percentage, date, quarter, workforce figure, or stated impact. Passing items in the checked batch are ordered by business evidence score.
9. Only candidates with verified free readable text and the required content quality are selected. The extracted text is kept temporarily as summarization evidence.
10. If the category still needs more items, fallback RSS feeds are fetched and checked through the same access, freshness, dedupe, ranking, and content-quality flow.
11. If no verified complete article is available, the category remains empty instead of using a paid, partial, generic, or landing-page result as filler.

## Config and Environment

- `NEWS_FEED_TIMEOUT_MS`: fetch timeout for Google News and fallback feeds.
- `NEWS_ARTICLE_TIMEOUT_MS`: timeout for checking one publisher page; defaults to 20 seconds.
- `NEWS_MIN_ARTICLE_WORDS`: minimum extracted readable text required for selection; defaults to 250 words.
- `NEWS_MAX_ARTICLE_CHARS`: maximum verified article text sent to summarization; defaults to 6,500 characters.
- `NEWS_MAX_AGE_DAYS`: current freshness window of 10 days.
- Google News source priority is currently hard-coded in `server.js`.
- Fallback feed source priority defaults are currently hard-coded in `server.js`.
- Fallback feed URLs and priorities are currently hard-coded by category in `server.js`.
- The conservative subscription-first host list and access-check concurrency are currently hard-coded in `server.js`.
- Article-structure rules, landing-page phrases, and the business evidence score are currently hard-coded in `server.js`.

## Edge Cases

- A failed Google News search logs an error and does not stop fallback source attempts.
- Failed fallback feeds are ignored through settled promise results.
- Articles without title or link are removed.
- RSS and Atom feeds have different link and date fields, so parsing handles both formats.
- Google News can return links with original source URLs in `guid` or source metadata.
- Google News RSS currently uses encoded intermediary links. Resolution depends on Google page parameters and an undocumented lookup response, so a Google markup/protocol change can make those candidates fail closed until the resolver is updated.
- Some feeds may include HTML or CDATA in descriptions; parsing strips tags and decodes common XML entities.
- A free page can still be rejected if it blocks automated requests or does not expose enough semantic article text. This is intentional: unverified pages are not used.
- Paywall detection uses a conservative host list, structured metadata, visible reading-gate phrases, and a readable-word threshold. Publishers can change their markup, so the checks reduce risk but cannot prove access forever.
- General site pages, investor-selection pages, report overviews, download forms, and news listing pages do not qualify as full articles even when their combined page text exceeds the word threshold.
- For company-focused topics, broad market commentary without a concrete event and verifiable details is rejected. This intentionally favors fewer, more specific business and finance stories.
- Access results are cached during one digest run so fallback expansion does not fetch the same candidate twice.
- Extracted article text is removed before the digest is returned or saved to history.
- If no unique, verified free article is found after expanded search, the app does not repeat old or paid news as filler.

## Testing Notes

- Test RSS parsing with item-based feeds.
- Test Atom parsing with entry-based feeds and alternate links.
- Test XML decoding and tag stripping.
- Test feed fetch timeout behavior.
- Test fallback expansion when Google News returns too few usable articles.
- Test that fallback RSS runs only after Google News is insufficient.
- Test known subscription-first host rejection.
- Test `isAccessibleForFree: false` and visible paywall phrase rejection.
- Test readable text extraction from JSON-LD `articleBody`, `<article>`, and `<main>` markup.
- Test rejection below the readable-word threshold and acceptance above it.
- Test that extracted evidence text is not kept in final digest history.
- Run `npm test` for the content-quality regression suite. It uses fixed HTML fixtures and mocked fetch responses, so it does not require live publisher access.
- The regression suite covers investor-type gates, generic market-report overviews, non-article main pages, short article-card listings, reading gates, full detailed business articles, business evidence scoring, and final business candidate selection.
