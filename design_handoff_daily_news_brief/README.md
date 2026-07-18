# Handoff: Daily News Brief — Settings & Preview App

## Overview
A web app that lets a user configure a daily AI-generated news email ("Morning Desk"): sender/recipient, send time, brief format (layout + language), news topics with keywords and per-topic advanced keyword suggestions, plus a Preview page showing the generated brief. A "Generate Now" action composes a test brief and shows it in Preview.

## About the Design Files
The files in this bundle are **design references built in HTML** (`Daily News Brief.dc.html` + its runtime `support.js`). They are interactive prototypes showing the intended look and behavior — **not production code to copy directly**. Your task is to **recreate this design in the target codebase's existing environment** (React, Vue, etc.) using its established patterns and libraries. If no environment exists yet, choose an appropriate framework (React is the closest match — the prototype's logic is a React-style class component).

Open `Daily News Brief.dc.html` in a browser to interact with the live prototype. The file has two parts:
- The `<x-dc>…</x-dc>` block: the full markup with inline styles (templating: `{{ name }}` holes, `<sc-if>` = conditional render, `<sc-for>` = list render).
- The `<script data-dc-script>` block: a React-style class (`state`, `setState`, event handlers) containing all interaction logic and mock data generation.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate pixel-perfectly using exact values below.

## Design Tokens

Colors:
- Page background: `#FBFAF7` (warm off-white)
- Card background: `#FFFFFF`; nested topic card: `#FCFBF8`
- Ink (headings/primary text): `#20241F`
- Body/secondary text: `#75736A`
- Muted labels/placeholders: `#A6A399`, `#B8B5AC`, `#B0ADA3`
- Accent green (links, active, buttons): `#54634F`; button fill `#344537`, hover `#2C382E`; button text `#F7F5EE`
- Accent rust (active tab underline, bullets, kicker, destructive hover): `#8C4A3A`
- Borders: `#ECEAE2` (hairlines/dividers), `#DEDCD2` (inputs), `#D7D4C9` (secondary buttons / toggle off)
- Working-status dot: `#C2A24B`

Typography:
- Serif: `'Newsreader', Georgia, serif` (Google Font, weights 300–600 + italics) — headings, wordmark, input values, primary buttons
- Sans: `'Helvetica Neue', Helvetica, Arial, sans-serif` — body, labels, small UI text
- Overline labels: 10–11px, uppercase, letter-spacing 0.10–0.18em, color `#A6A399`
- Page title: Newsreader 400, 44px, line-height 1.05, letter-spacing −0.01em
- Card titles: Newsreader 500, 24px; subsection: 17px

Other:
- No border-radius anywhere except toggles (11px pill) and circular dots/nav numbers (50%)
- Focus style: input/textarea border-color → `#9AA694`; placeholder color `#B8B5AC`
- Links: `a { color:#54634F }`, hover `#20241F`

## Layout

Root: full-height flex row on `#FBFAF7`.

### Left rail (sidebar), 236px fixed, sticky full-height
- Right border 1px `#ECEAE2`; padding 44px 32px 36px; vertical flex
- Collapse button top-right (18×22, `<` glyph scaled `scaleY(1.9)`, color `#A6A399` → hover `#54634F`). When collapsed, sidebar is hidden and an `>` expand button sits absolutely at top-left of the page (top 14px, left 24px)
- Brand block, centered: sunrise line-art SVG (52×30, stroke `#54634F`, 1.3px), wordmark "MORNING DESK" (Newsreader 19px, letter-spacing 0.28em), sub "DAILY NEWS BRIEF" (9.5px, letter-spacing 0.32em, `#A6A399`)
- Divider, then a 2-step nav: numbered circles (26px, 1px border) + labels "Send Settings" / "Preview". Active step: border/number `#54634F`, label `#20241F`; inactive: `#D7D4C9` / `#A6A399`. Steps connected by a 1px × 26px vertical line. Clicking switches the main page
- Bottom (pushed with flex spacer): "ACCOUNT" overline, green 6px dot + recipient email (12px, `#54634F`, ellipsized), underlined text links "Disconnect Google" (hover ink) and "Sign out" (hover rust `#8C4A3A`)
- Footer tagline: Newsreader italic 14.5px `#54634F` — "Simple. Local. Yours."

### Main column
- `max-width:880px; margin:0 auto; padding:52px 56px 64px`; content column below header `max-width:760px`
- Header: left — h1 "Daily News Brief" (44px), 56×1.5px ink rule below (margins 18px/22px), one-line description (14px/1.75 `#75736A`). Right (Settings page only) — primary button "Generate Now" (`#344537` fill, `#F7F5EE` text, Newsreader 16.5px, padding 14px 26px, hover `#2C382E`); label becomes "Generating…" while working

## Screens

### 1. Send Settings (card: white, 1px `#ECEAE2` border, padding 34px 34px 38px)

**Send Settings section**
- "Sender Email" and "Recipient Email": overline label + underline-only input (border-bottom 1px `#DEDCD2`, Newsreader 16.5px)
- Row: "Send Every Day" pill toggle (38×22, on = `#344537`, knob 18px white translating 16px, .2s transition) + "SEND TIME" time input (underline style, 120px). When toggle is off, the time input dims (border `#ECEAE2`, text `#C4C1B7`) but stays visible

**Brief Format subsection** (top border divider, h3 17px)
- "LAYOUT" row: text-tab pair "Paragraph | Bullet Points"; active tab: ink text + 1.5px `#8C4A3A` underline; inactive: `#B0ADA3`, transparent underline. 13.5px, .15s transition
- "LANGUAGE" row: same tab treatment, "EN | 中文"

**News Topics section** (divider; h2 24px + helper "Add topics and the keywords to watch." 12px `#A6A399`; right-aligned secondary button "Add Topic" — transparent, 1px `#D7D4C9` border, `#54634F` text, 12px, hover border `#54634F`)

Each topic card (border `#ECEAE2`, bg `#FCFBF8`, padding 20px 22px):
- Header row (flex, gap 14px): enable toggle (same pill spec), topic-name input (borderless transparent, Newsreader 17px), "COUNT" number input (42px, 1–9), × remove button (`#B8B5AC` → hover `#8C4A3A`)
- "KEYWORDS, SEPARATED BY COMMAS" overline + 2-row textarea (1px `#DEDCD2`, white, Newsreader 14.5px/1.6, vertical resize)
- **Advanced Setting** (divider): disclosure button "▸ ADVANCED SETTING" (11px uppercase, `#54634F`, caret rotates 90° when open, .2s). Open state contains ONLY:
  - Helper: "Select suggested keywords, then add them to this topic's focus." (12px `#A6A399`)
  - 6 suggestion chips (Newsreader 13.5px, padding 7px 13px; unselected: white bg, `#DEDCD2` border, `#54634F` text; selected: `#344537` bg/border, `#F7F5EE` text; toggles on click)
  - Buttons row: "Add to focus (n)" — disabled look (`#EDEBE3` bg, `#B8B5AC` text, default cursor) when nothing selected; enabled (`#344537` bg, cream text) when ≥1 chip selected — and secondary "Regenerate keywords"
  - NOTE: an earlier "Preferred Website" field was **removed** — do not include it
- Default seed topic: "Frontier Neuroscience Research", count 1, keywords "neuroscience paper, neuroscience publication, Nature Neuroscience, Neuron, Science neuroscience, Cell neuroscience"

**Save footer** (divider): left — saved indicator "✓ All changes saved" / "○ Unsaved changes" (11.5px `#54634F`); right — primary "Save all" button (`#344537`, Newsreader 16px)

### 2. Preview (card, min-height 520px)
- Header: h2 "Preview" + status at right: label "Ready" / "Working" / "Delivered" with 7px dot (`#54634F` green; `#C2A24B` amber while working)
- **Empty state** (centered): small skeleton "newspaper" illustration (150×110 card, `#FCFBF8` bg, offset shadow `6px 6px 0 #F2F0E8`, gray bars) + caption (Newsreader 15px/1.8 `#A6A399`): "Save your settings, then click "Generate Now" to test once. If Gmail sending is not available, this area will show a preview."
- **Generating state**: centered italic "Composing your brief…"
- **Result state**: newspaper-style brief —
  - Masthead: kicker "DAILY BRIEF" (10.5px, ls 0.22em, `#8C4A3A`), title "Daily News" / "每日新闻" per language (Newsreader 30px), timestamp "Generated M/D/YYYY, h:mm:ss" (11.5px `#A6A399`), 1.5px ink bottom rule
  - Per topic: section (26px top pad, `#ECEAE2` bottom rule) with topic h4 (Newsreader 500 19px), then per item: headline row (in Bullet layout, 6px `#8C4A3A` dot + 24px content indent; in Paragraph layout, no dot/indent), headline Newsreader 500 17px `#39463B`, summary 13px/1.75 `#75736A`, stamp 10.5px ls 0.08em `#B8B5AC`
  - Footer line: "Sent to {recipient} daily at {time}." (11.5px, email in `#54634F`)

## Interactions & Behavior
- Sidebar nav switches page (settings/preview); collapse/expand sidebar
- Any content edit sets saved=false ("○ Unsaved changes"); "Save all" sets saved=true
- Layout (paragraph/bullets) and language (en/zh) tabs re-render the existing preview result instantly — content is stored in both languages
- Topic toggle enables/excludes topic from generation; Add Topic appends "New Topic" with fresh suggestions; × removes
- Chips: click toggles select; "Add to focus" merges selected into the keywords string (deduped, comma-joined), removes them from the chip list, clears selection; "Regenerate keywords" reshuffles 6 suggestions from a pool (neuroscience pool if topic name contains "neuro"/"brain", else generic)
- Generate Now: sets generating state, ~1.4s later builds mock result grouped by enabled topics (≤3 items per topic, headline built from keywords) and navigates to Preview
- In production, replace the mock generation with the real news-fetch/LLM pipeline and Gmail send; state shape to keep: `{sender, recipient, time, sendDaily, format:'paragraph'|'bullets', lang:'en'|'zh', topics:[{id,name,enabled,count,keywords,advOpen,selected,suggestions}], saved, generating, result}`

## Assets
- Google Font: Newsreader (weights 300/400/500/600 + italic 300/400)
- Logo: inline sunrise SVG in the prototype (7 strokes) — copy from the HTML file
- No raster images

## Files
- `Daily News Brief.dc.html` — the full prototype (markup + logic)
- `support.js` — prototype runtime; required only to open the HTML locally, ignore for implementation
