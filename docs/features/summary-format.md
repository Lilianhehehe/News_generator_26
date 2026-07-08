# Summary Format (Paragraph / Bullet Points) and Language (English / Chinese)

## Purpose

Lets the user switch the generated results on the page between the original paragraph form and a structured bullet-point form, and between English and Simplified Chinese. Both toggles are always visible (even before the first generation) and persist. This is additive: the English paragraph stays the source of truth and is always stored unchanged; bullets and Chinese are produced at runtime.

## Related Files

- `server.js`: `BULLET_CONVERSION_SYSTEM_PROMPT`, `TRANSLATION_SYSTEM_PROMPT`, the shared `runTextModel` / `runTextModelWithClaude` / `runTextModelWithOpenAI` helpers, `convertSummaryToBullets`, `translateToChinese`, `formatAnthropicError`, and the `POST /api/bullets` and `POST /api/translate` routes.
- `api/bullets.js`, `api/translate.js`: Vercel handlers that delegate to `handleApi`.
- `public/index.html`: the `Paragraph | Bullet Points` and `English | 中文` toggles above the preview (in `.result-toggles`).
- `public/app.js`: toggle state, per-item bullet cache, per-string translation cache, `/api/bullets` and `/api/translate` calls, deferred fill of summaries/text, and bullet markdown rendering.
- `public/styles.css`: `.result-toggles`, `.format-toggle`, `.bullet-summary`, and `.summary-pending` / `.text-pending` styles.

## Data Flow

1. The digest is generated and stored exactly as before; each article keeps its paragraph summary.
2. In "Paragraph" mode the stored paragraph is shown directly with no API call.
3. In "Bullet Points" mode the browser calls `POST /api/bullets` once per visible item with `{title, timestamp, paragraph}`.
4. The server converts with a fixed system prompt: 2-5 merged, substantial bullets; direct declarative statements (no "What happened" labels, no "The article covers..." meta-language); keep every concrete detail from the paragraph; strictly no information that is not in the paragraph. It uses the Claude Messages API (`claude-opus-4-8` by default) when `ANTHROPIC_API_KEY` is set, otherwise it falls back to the OpenAI Responses API with the existing `OPENAI_API_KEY` and `OPENAI_MODEL`.
5. The returned bullets are rendered (simple `- ` list plus `**bold**` support) and cached in memory per item, so toggling back and forth does not re-call the API.
6. In "中文" mode the browser calls `POST /api/translate` with the currently displayed English text (title, summary paragraph or bullets, category heading, status lines) and renders the returned Simplified Chinese; the translation prompt asks for natural, simple, everyday Chinese, preserves bullet structure, and adds no facts. Timestamps are re-rendered with the `zh-CN` locale client-side (no API call).
7. Translations are cached in memory per source English string, so toggling English/中文 back and forth does not re-call the API. English is always kept as the fallback if a translation is still loading or fails.
8. The chosen format and language are persisted in `localStorage` under `summaryFormat` and `resultLanguage`.

## Config and Environment

- `ANTHROPIC_API_KEY`: preferred provider for bullet conversion. If missing, the app falls back to `OPENAI_API_KEY`; if both are missing, the bullet view shows a per-item error and paragraph mode still works.
- `ANTHROPIC_MODEL`: defaults to `claude-opus-4-8`.
- `ANTHROPIC_TIMEOUT_MS`: request timeout, defaults to 60000.
- `ANTHROPIC_MAX_OUTPUT_TOKENS`: response token limit, defaults to 2048.

## Edge Cases

- `POST /api/bullets` and `POST /api/translate` require a signed-in session, like the other API routes.
- A missing or empty `paragraph` (bullets) or `text` (translate) returns 400.
- Conversion/translation failures (missing key, API error, refusal, empty output) return 502; bullet failures show inline on the affected item, translation failures silently leave the English text in place.
- The client bullet cache is keyed by `title|paragraph`; the translation cache is keyed by the exact English source string. Both are in-memory only and clear on page reload.
- The email body always uses the English paragraph; both toggles affect only the web preview.
