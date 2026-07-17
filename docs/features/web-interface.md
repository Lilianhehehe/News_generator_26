# Web Interface

## Purpose

The browser interface presents the signed-in user's news settings and generated digest in the Morning Desk editorial layout. This is a presentation layer over the existing authentication, config, keyword, translation, bullet-formatting, generation, and Gmail APIs.

## Related Files

- `public/index.html`: login view, collapsible desktop sidebar, Settings and Preview pages, topic template, and inline sunrise SVG.
- `public/styles.css`: Morning Desk design tokens, Newsreader typography, desktop layout, mobile breakpoints, controls, topic cards, and newspaper-style digest preview.
- `public/app.js`: page navigation, sidebar state, saved/unsaved feedback, dynamic topic controls, API calls, and digest rendering.
- `design_handoff_daily_news_brief/`: read-only design reference; it is not used at runtime.

## Interface Flow

1. Signed-out users see the branded Google sign-in card.
2. Signed-in users land on Send Settings. The sidebar switches between Send Settings and Preview without changing API state.
3. Editing saved settings marks the form as unsaved. `Save all` writes the current config through `PUT /api/config`.
4. `Generate Now` saves first, switches to Preview, shows the composing state, and calls `POST /api/run` with email sending enabled.
5. The Preview page renders the real API response in a newspaper layout. Paragraph/bullet and English/Chinese controls continue to rerender the existing result through the current conversion APIs.

## Design and Behavior Constraints

- Use the color, spacing, and typography variables in `public/styles.css`; headings and primary actions use Newsreader.
- Keep cards and buttons square. Border radius is reserved for toggles and circular indicators.
- Sender and recipient fields remain read-only because both are scoped to the verified Gmail session, even though the design reference shows ordinary text fields.
- Topic count remains `1–10`, matching server behavior.
- The sidebar is sticky and collapsible on desktop. At `700px` and below it becomes a compact top rail while keeping account, sign-out, and disconnect controls available.
- Do not copy runtime logic from the design prototype. Production behavior stays in `public/app.js` and the server APIs.

## Testing

- Run `npm test` from the project directory.
- Run `cd "/Users/lisa/Desktop/AI Projects/News Generator" && npm start`, then verify the login view and sign in.
- On Send Settings, verify topic add/remove, toggles, Focus editing, advanced keyword selection, saved/unsaved feedback, and sidebar collapse/expand.
- Generate a brief and verify Working/Delivered status, real article links, article summaries, timestamps, empty-topic errors, and the delivery note.
- Switch Paragraph/Bullet Points and EN/中文 after a result exists, then verify the Preview updates.
- Check layouts above `900px`, between `701–900px`, and at `700px` or below.
