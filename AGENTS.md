# News Generator Instructions

- Do not start programming for this project until the user has approved the plan.
- This file is the current project instruction file.
- The old `agent.md` file is an outdated design draft and should not be used as the source of current requirements.
- News items must come from the last 10 days only.

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

- Each news summary must be exactly 5 or 6 sentences.
- This is an enforced rule, not a suggestion.
- A summary with fewer than 5 sentences or more than 6 sentences is invalid.
- The program must count sentences after AI generation.
- If a generated summary fails the sentence-count check, the program must send it back for revision or regenerate it.
- The final page must only show summaries that pass this check.
- The summary must be long enough to help the reader understand the news.
- Do not write only 2-3 general sentences.
- The summary should explain what happened, who or what is involved, why it matters, what is new or important, and what the reader should understand from it.
- The 5-6 sentences should explain: what happened; who or what is involved; what method, decision, event, or system is involved; what the key finding, result, or change is; why it matters; and what it may affect, help with, or lead to next if the article supports it.
- Each news item should internally cover: what happened, key details, why it matters, what is new or useful, and what to watch next if the article supports it.
- Each sentence must add useful information.
- Do not add filler sentences just to reach 5 sentences.
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
- Does each summary have exactly 5 or 6 sentences?
- Are the sentences simple and clear?
- Is each summary specific enough?
- Does each summary explain what the news is about?
- Does the summary avoid talking about the article, source, or publication time?
- Did the summary avoid unsupported or invented facts?
- Does the page keep the same structure?

If the output fails a check, the program should revise the output before showing it to the user.
