# News Generator Instructions

- Do not start programming for this project until the user has approved the plan.
- This file is the current project instruction file.
- The old `agent.md` file is an outdated design draft and should not be used as the source of current requirements.
- News items must come from the last 10 days only.
- Generated news should not repeat articles used in the last 10 days.
- If Google News has too few non-repeated results, the app should expand to category-matched official RSS sources from other websites.
- If no unique article is found after expanded search, the app should not repeat old news as filler.
- The server should log its app version, loaded `server.js` modified time, and process start time at startup so stale background processes are easy to detect.
- The project supports Vercel deployment with serverless API routes in `api/` and cron configuration in `vercel.json`.
- Local runs use `data/config.json` and `data/history.json`. Vercel runs should use Upstash Redis through `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- Vercel Hobby Cron calls `/api/cron` once per day at 12:00 UTC. The Vercel Cron route sends when called and skips if an email was already sent on the same local date. The local background scheduler still checks the configured timezone and send time.
- The shared app logic remains in `server.js`. API route files should import and reuse `handleApi` instead of duplicating news generation code.
- `vercel.json` must keep explicit builds and routes so Vercel serves `public/` as static files and `api/*.js` as serverless functions, instead of using the local `server.js` file as the production root entrypoint.

## News Writing Rules

The News Generator must apply these rules every time it asks AI to generate the news page.

### Language

- Write the final news page directly in English.
- Do not write Chinese first.
- Do not translate from Chinese.
- Do not leave any Chinese text in the final page.
- Use simple English only.
- Use very simple words.
- Use clear, short sentences.
- Each sentence should explain one main idea.
- Avoid complex words when simple words work better.
- Avoid formal phrases such as "inform efforts," "provide a framework," "strategic," and "long-term value."

### Page Structure

Keep the same page structure:

- Main title
- Generated time
- Category title
- News title
- News summary
- Publication time

### Summary Length and Usefulness

- Each news summary should be detailed enough to explain the news clearly.
- The summary should usually be about 90-130 simple English words when the article data supports it.
- Do not optimize for sentence count. Focus on useful information.
- A summary with fewer than 70 words is invalid unless no article data exists.
- The program must check summary length after AI generation.
- If a generated summary is too short, the program must send it back for revision or regenerate it.
- The final page must only show summaries that pass this detail check.
- The summary must be long enough to help the reader understand the news without opening the link.
- Do not write a short 2-3 sentence summary.
- The summary should explain what happened, who or what is involved, why it matters, what is new or important, and what the reader should understand from it.
- The summary should explain as many of these points as the article data supports: what happened; who or what is involved; what method, decision, event, or system is involved; what the key finding, result, or change is; why it matters; and what it may affect, help with, or lead to next.
- Include 4-6 concrete information points when supported by the article data.
- Each information point should add useful information.
- Do not add filler just to reach the target length.
- The final summary can be one natural paragraph.
- Do not mention the source name or publication time inside the summary.
- Do not write filler such as "the article was published by," "the report says," or "according to the source."

### Be Specific

- Avoid vague summaries such as "This study may help future research" or "This policy may affect the market."
- Explain the reason in simple and concrete language.
- Include useful details that are actually supported by the article.
- If a detail is not in the article, skip it.
- Do not write useless missing-detail sentences such as "The article does not give specific company names."

### Topic-Specific Detail Rules

For business, finance, or economy news, focus on useful details such as:

- company names
- product names
- market changes
- numbers or prices
- policy details
- business impact
- examples mentioned in the article

For biology, neuroscience, medicine, or research news, focus on useful details such as:

- what question the study is trying to answer
- what the researchers found
- what is new or innovative about the study
- why the finding matters
- possible future uses
- how it may help future research
- limits or open questions mentioned in the article

For policy, law, or politics news, focus on useful details such as:

- what policy, law, or decision changed
- who is affected
- what may happen next
- why the change matters
- what conflict or debate is involved

For technology news, focus on useful details such as:

- what the technology does
- what problem it tries to solve
- what is new about it
- who may use it
- what limits, risks, or open questions remain

For international news, focus on useful details such as:

- which countries or groups are involved
- what happened
- how it may affect relationships, security, trade, or public opinion

### Do Not Make Things Up

- Do not invent facts that are not supported by the article.
- Do not invent company names, research results, numbers, prices, future uses, political effects, quotes, or examples.
- If the article does not support a detail, skip that detail.
- Use only the article data provided to the AI request as evidence.

### Final Self-Check

Before saving or displaying the final news page, the program should check:

- Is the whole page in English?
- Is there any Chinese text left?
- Is each summary detailed enough, usually about 90-130 simple English words when the article data supports it?
- Does each summary avoid being only 2-3 general sentences?
- Are the sentences simple and clear?
- Is each summary specific enough?
- Does each summary explain what the news is about?
- Does the summary avoid talking about the article, source, or publication time?
- Did the summary avoid unsupported or invented facts?
- Does the page keep the same structure?

If the output fails a check, the program should revise the output before showing it to the user.
