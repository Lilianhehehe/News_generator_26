# Summarization

## Purpose

Summarization rewrites selected articles into simple English titles and detailed summaries. The final page and email should only show summaries that pass validation.

## Related Files

- `server.js`: `NEWS_STYLE_PROMPT`, OpenAI request creation, response parsing, generated article validation, title and summary normalization, and failure behavior.
- `AGENTS.md`: contains the writing rules that summarization must follow.
- `docs/features/daily-digest.md`: explains where summarization fits in the full digest flow.

## Data Flow

1. Only articles that passed the free full-text access check reach summarization.
2. Selected articles are flattened into model input with category id, category name, focus flags, title, source, date, snippet, verified readable article text, and link.
3. If `OPENAI_API_KEY` is missing, all category articles are hidden and a preview-only message is returned.
4. The app sends the articles to the OpenAI Responses API with a strict JSON schema and tells the model to prefer the verified article text over the short RSS snippet.
   Business summaries request concrete source-backed details. For layoffs, this includes the number of affected jobs, timing, affected teams or locations, stated reason, and concrete impact when the article provides them.
5. The model returns `categoryId`, `link`, `englishTitle`, and `englishSummary` for each article.
6. The app validates every expected generated article.
7. If validation fails, the app asks the model to revise affected items and tries again.
8. Only valid generated articles are shown.
9. Temporary extracted article text is removed before the final digest is returned or saved.
10. Invalid or missing generated articles are hidden.

## Config and Environment

- `OPENAI_API_KEY`: required for final validated summaries.
- Store the OpenAI API key in `.env.local` as `OPENAI_API_KEY`; do not write the real key into Markdown docs or committed files.
- `OPENAI_MODEL`: defaults to `gpt-5-mini`.
- `OPENAI_TIMEOUT_MS`: request timeout.
- `OPENAI_MAX_OUTPUT_TOKENS`: response token limit.
- `OPENAI_MAX_REWRITE_ATTEMPTS`: maximum validation and revision attempts.
- The writing prompt is currently hard-coded in `server.js`.

## Edge Cases

- If no articles are available, summarization returns without calling OpenAI.
- If the API key is missing, no short fallback summaries are shown as final output.
- If OpenAI quota is missing, the app returns a clearer billing/quota message.
- Generated articles are matched by `categoryId` and `link`.
- Summaries under 70 words are invalid.
- Summaries over 160 words are invalid.
- Chinese text is invalid.
- Missing titles or summaries are invalid.
- Summaries that talk about the article, report, source, or publication time are invalid.
- If a generated item fails validation after all attempts, it is hidden.
- The model receives at most `NEWS_MAX_ARTICLE_CHARS` characters of extracted article text per selected item to control request size.
- Numbers, dates, amounts, percentages, timelines, and cause-and-effect claims must be directly supported by the provided article evidence. Missing details must be skipped rather than estimated or inferred.

## Testing Notes

- Test validation for word count, Chinese text, missing fields, and source/time filler.
- Test response extraction for `output_text` and nested output content.
- Test failure behavior when `OPENAI_API_KEY` is missing.
- Test that invalid generated articles are hidden and category errors are set when no valid summary remains.
- Test that verified article text is included in model evidence and preferred over the RSS snippet.
- Test that temporary article text is removed from final article objects.
- A future mock harness should inject model output so summarization can be tested without calling OpenAI.
