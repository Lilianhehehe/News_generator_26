# Web Interface

## Purpose

The browser interface lets a signed-in user configure delivery, manage news topics, generate short keyword suggestions, run a digest, and view the preview.

## Related Files

- `public/index.html`: Settings and Preview markup, topic template, and keyword controls.
- `public/app.js`: UI state, config API calls, topic editing, keyword generation, and preview rendering.
- `public/styles.css`: responsive layout and visual styling.
- `server.js`: config and keyword API handlers used by the interface.

## Topic and Keyword Behavior

- Each topic has a visible name, enabled state, item count, and Focus field.
- Focus is the source of truth for search. The backend searches the comma-, semicolon-, or newline-separated terms shown there.
- Generated keywords are suggestions only and do not affect search until the user selects them and chooses Add to focus.
- Suggestions contain one to four words so they remain useful as search terms.
- Suggestions are generated only when the user clicks Generate keywords or Regenerate keywords. Typing, leaving a field, selecting a suggestion, and adding it to Focus never call the keyword API.
- Regenerate keywords sends the current Focus terms and previous suggestions as exclusions. The backend also removes exact and near duplicates.
- If no distinct replacement suggestions are available, the UI shows an empty suggestion state instead of repeating old topics.
- Every topic created with Add Topic receives an automatic fallback RSS profile at generation time. No source setting is required in the form.

## Main Flow

1. The signed-in user's config is loaded from `/api/config`.
2. Topic cards are rendered from the saved categories.
3. Keyword generation calls `POST /api/keywords` with the topic name, Focus text, and excluded keywords.
4. Save all writes the visible settings back to `/api/config`.
5. Generate Now saves settings, calls `/api/run`, and renders the returned digest on Preview.

## Assumptions and Edge Cases

- After the topic name or Focus changes, the app tracks the saved suggestions as outdated internally without showing a warning chip. The suggestions remain visible and never change or affect search until the user explicitly regenerates or adds them to Focus.
- Clearing Focus and saving it leaves the topic with no search terms; generation skips that topic until Focus contains a term.
- Adding suggestions preserves the user's existing Focus text.
- Different users have separate saved UI settings through their verified Gmail account.
- The interface remains usable on narrow screens; topic controls may wrap without changing their behavior.

## Testing Notes

- Confirm generated suggestions contain no more than four words.
- Add a suggestion to Focus and confirm the exact visible term appears in the next search query.
- Regenerate twice and confirm the second set does not repeat Focus terms or the first suggestion set.
- Edit the topic name or Focus, leave the field, and click a suggestion. Confirm no warning chip appears and no keyword request occurs until Generate keywords or Regenerate keywords is clicked.
- Save, reload, and confirm Focus and generated suggestions persist separately.
- Run a digest and confirm Preview navigation and rendering still work.
