# Web Interface

## Purpose

The browser interface presents delivery settings, topic controls, generated-keyword suggestions, and the digest preview in the Morning Desk editorial layout. It is a presentation layer over the existing authentication, config, keyword, generation, translation, bullet-formatting, and Gmail APIs.

## Related Files

- `public/index.html`: login view, collapsible sidebar, Settings and Preview pages, topic template, and sunrise SVG.
- `public/styles.css`: Morning Desk design tokens, responsive layout, controls, topic cards, and newspaper-style preview.
- `public/app.js`: page navigation, saved state, topic editing, manual keyword generation, API calls, and digest rendering.
- `server.js`: config, keyword, search, fallback RSS, digest, and authentication handlers used by the interface.
- `design_handoff_daily_news_brief/`: read-only design reference; it is not used at runtime.

## Main Flow

1. Signed-out users see the branded Google sign-in card.
2. Signed-in users land on Send Settings and can switch to Preview through the sidebar.
3. Editing saved settings marks the form as unsaved. `Save all` writes the visible config through `PUT /api/config`.
4. `Generate Now` saves first, switches to Preview, and calls `POST /api/run`.
5. Preview renders the real digest response. Paragraph/bullet and English/Chinese controls rerender the existing result through the current conversion APIs.

## Topic and Keyword Behavior

- Focus is the source of truth for search. Generated keywords do not affect search until the user selects them and chooses Add to focus.
- Suggestions contain one to four words and are generated only through Generate keywords or Regenerate keywords.
- Regeneration sends Focus terms and previous suggestions as exclusions. The backend removes exact and near duplicates and may return fewer suggestions.
- Editing or leaving Topic/Focus, selecting a suggestion, and adding it to Focus never call the keyword API.
- Add Topic categories receive an inferred fallback RSS profile during generation; no source field is required in the form.

## Design and Behavior Constraints

- Use the design variables in `public/styles.css`; headings and primary actions use Newsreader.
- Keep cards and buttons square. Border radius is reserved for toggles and circular indicators.
- Sender and recipient remain read-only because both come from the verified Gmail session.
- Topic count remains `1–10`, matching server behavior.
- The desktop sidebar is sticky and collapsible. At `700px` and below it becomes a top rail while keeping account actions available.
- Above the tablet breakpoint, the main column grows with the browser up to `1100px`. The header and Settings/Preview card share the same left and right boundaries.
- Production behavior stays in `public/app.js` and server APIs; do not copy runtime logic from the design prototype.

## Assumptions and Edge Cases

- Saved suggestions may be tracked as outdated internally after Topic or Focus changes, but no warning chip is shown and suggestions change only after explicit regeneration.
- An explicitly empty Focus stays empty and skips source searches for that topic.
- Different verified Gmail users have separate settings and histories.

## Testing

- Run `npm test` from the project directory.
- Run `cd "/Users/lisa/Desktop/AI Projects/News Generator" && npm start`, then sign in and verify Settings/Preview navigation.
- Verify topic add/remove, Focus editing, manual keyword generation, selection, saved state, and sidebar collapse/expand.
- Regenerate twice and confirm new suggestions do not repeat Focus terms or the prior set.
- Generate a brief and verify status, article links, summaries, timestamps, empty-topic errors, and delivery information.
- Switch Paragraph/Bullet Points and EN/中文 after a result exists.
- Check layouts above `900px`, between `701–900px`, and at `700px` or below.
