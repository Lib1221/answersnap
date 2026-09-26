# AnswerSnap privacy policy

Last updated: September 25, 2026

AnswerSnap is a Chrome extension that drafts answers to job, freelance, and scholarship
application questions from your own resume and website. This policy explains what it handles,
where that data lives, and who receives it.

## What AnswerSnap handles

- **Your candidate data:** the resume files, website text, notes, cover letter, stories, profile,
  and standard answers (such as your notice period or rate) that you add in the extension's
  settings.
- **Saved answers:** answers you insert, copy, or save, with the question and the site they were
  for.
- **The area you snip:** when you snip a question, a screenshot of that area and the visible text
  in it, the page title and site name (no query strings), and details of the form field you are
  filling (its label and character limit).
- **Job posts you choose to add**, from a snip, a selection, or a page.
- **Your applicant details** (for scholarship and university forms): names, birth date and place,
  citizenship, passport and ID numbers and dates, codice fiscale, contact details, addresses,
  education, and language tests. They are stored only on this computer, are never sent to the AI
  provider, never synced, and never exported. They are only written into forms you fill.
- **Your application tracker:** for each job post you save, the site, role, company, the status
  you set, and your notes. It is never sent to the AI provider. Follow-up reminders are checked
  on this computer and shown as Chrome notifications; you can turn them off.
- **Your AI provider API key**, which you paste in yourself.

## Where it is stored

Everything is stored locally in your Chrome profile, using Chrome's extension storage:

- Candidate data, settings, and saved answers are kept on this computer until you delete them.
- Your API key is kept on this computer, or only until Chrome closes if you pick that option. It
  is stored unencrypted, like most extension settings. It is never synced or exported.
- Screenshots are never stored. The snipped image is held in memory for the current question only
  and is dropped when you snip the next one or close the side panel.
- Job posts are kept for 12 hours per site, and only until Chrome closes.

AnswerSnap has no servers and no accounts.

## What is sent, and to whom

AnswerSnap sends data only to the AI provider you configure (Anthropic, Google Gemini, OpenRouter,
or Ollama running on your own computer), using your own API key, and only when you act:

- **When you snip a question:** the screenshot of the snipped area (unless you turn screenshots
  off), the visible text in it, the page title and site, the field's label and limits, your job
  post if you set one, up to three similar saved answers, the answers you gave on the same site
  in the last day (so a multi-page application stays consistent), and your candidate data.
- **When you build your profile:** the text of your enabled sources.
- **When you use "Read with AI":** the images of the pages or snips you are importing.
- **When you test your key:** a request for the list of available models, which contains no
  personal data.

Settings > Privacy > "What gets sent" shows the last request, without the key or image data.

If you use **Google Gemini's free tier**, Google may use the content you send to improve its
products, under Google's terms. Use a paid key if that isn't acceptable to you. If you use
**OpenRouter**, it passes your request to the company that runs the model you pick, under that
company's terms. With **Ollama**, requests go to the Ollama server on your own computer (or the
address you enter) and nowhere else. Each provider's own privacy terms govern what happens to data
after it reaches them.

When you import a website, AnswerSnap asks Chrome for permission to read that one site, then
downloads its pages directly from the site.

If you turn on **Sync across devices** (off by default), your settings, profile, standard
answers, stories, cover letter, and tracked applications are stored in Chrome Sync, under your
Google account, so your other computers get them. API keys, resume and website sources, and saved
answers never sync. Turning sync off can also delete the synced copy.

## What is never collected

No analytics, no telemetry, no tracking, no browsing history, no advertising. Nothing is sold or
shared with anyone other than the AI provider you pick.

## Retention and deletion

- Saved answers older than your retention setting (180 days by default) are removed
  automatically, unless you pinned them.
- Settings > Privacy > "Delete all data" removes your API keys, sources, profile, standard
  answers, saved answers, and settings, and gives back every site permission.
- Uninstalling the extension removes all of its data from Chrome.

## Contact

Questions about this policy: [contact email]
