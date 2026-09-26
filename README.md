# AnswerSnap

A Chrome extension for job applications. Snip a question on any application form and get an
answer written from your own resume, then insert it with one click. It also writes cover letters
and follow-up emails, checks how well you fit a job, prepares you for the interview, and tracks
every application.

Made by Liben.

## What it does

- **Snip and answer:** press `Alt+Shift+Q`, drag around a question, and get a draft in your own
  voice from your resume, website, and notes. Edit, refine (shorter, longer, more formal), and
  insert it into the field.
- **Fill the whole form:** scan every field on a page, draft all the answers in one request,
  review them, then insert the ones you tick. It never submits the form.
- **Job tab** for the job post you save:
  - **Letter:** a cover letter tailored to the job, in the voice of a letter you wrote before
  - **Fit:** a match score, the requirements you meet (with evidence), gaps with advice, and
    keywords to use
  - **Interview:** the questions you're likely to get, with suggested answers from your profile
  - **Email:** thank-you notes, follow-ups, and replies to offers
- **Scholarships and university applications (Study tab):** your passport, birth, citizenship,
  address, and education details are filled exactly, in the format each field expects (DreamApply,
  Universitaly, Esse3, and other portals), then checked on the page. Read your passport's
  machine-readable lines to fill your details, validate your codice fiscale, check a call's
  deadlines, age limits, and language minimums against your details, and keep a document
  checklist. Personal details are never sent to the AI.
- **Resume builder:** build your CV in a FlowCV-style editor, starting from your profile. Add,
  hide, rename, and reorder sections, write with bold, italics, and bullets, and style everything
  (layout, columns, colors, headings, dates, skill levels, and FlowCV's fonts, bundled so the PDF
  looks the same on every computer) or pick one of 8 templates, or save your own.
  Write it in English, Italian, French, Spanish, or German, with the GDPR consent line Italian
  applications ask for. Download PDF saves real, selectable text that matches the preview page
  for page. Open it from Settings or the Profile tab.
- **Application tracker:** every job post you save is tracked, from saved to offer, with notes
  and a CSV export.
- **Story bank:** your STAR stories, used first for "tell me about a time" questions.
- **Library:** answers you've used, reused when the same question comes up again.
- **Fact check** (optional): every sentence checked against your profile.
- **Answer confidently** (default) or **stick to my profile**: you choose whether answers fill
  gaps with modest claims (always listed as "Assumed" so you can check them) or leave
  placeholders.

## AI providers

Bring your own key:

- **Google Gemini:** the free tier works. The default model is Gemini 3.1 Flash-Lite, with
  automatic fallback to other Gemini models when one reaches its daily limit.
- **Anthropic (Claude)**
- **OpenRouter:** one key for Claude, GPT, Llama, and hundreds more.
- **Ollama:** free and private; models run on your own computer, and nothing leaves it. Start
  Ollama with `OLLAMA_ORIGINS=chrome-extension://*` so the extension may use it.

## Privacy

Everything stays in your browser. Your data goes only to the AI provider you configure, and only
when you ask for something. No analytics, no tracking, no account. Screenshots are never stored.
See [docs/PRIVACY.md](docs/PRIVACY.md).

## Install from source

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose
`.output/chrome-mv3`. Open the extension's settings, add your API key and your resume, and you're
ready.

**Firefox (experimental):** `pnpm build:firefox`, then open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on**, and pick `.output/firefox-mv3/manifest.json`. The panel opens as
Firefox's sidebar. If answers fail, allow the add-on's site access in `about:addons` >
AnswerSnap > Permissions.

## Languages

The side panel is available in English, Amharic (አማርኛ), Spanish, and French, following Chrome's
language. The translations were made with AI help; corrections are welcome. Settings pages are
English for now.

## Development

```sh
pnpm dev                                    # hot reload in a WXT-launched Chrome
pnpm typecheck && pnpm lint && pnpm test    # must pass before every commit
pnpm test:e2e                               # Playwright, with a mock AI server
```

See [CLAUDE.md](CLAUDE.md) for the folder map and rules, [DECISIONS.md](DECISIONS.md) for design
decisions, and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

If AnswerSnap helps you, a star on GitHub is appreciated.
