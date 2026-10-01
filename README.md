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
  review them, then insert the ones you tick. It never submits the form. In a pop-up form like
  LinkedIn's Easy Apply it reads only that window, one step at a time. Screening questions that
  can reject you are answered from your own data (years with a skill are counted from your dated
  jobs), and self-identification, consents, and work authorization are left to you.
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
- **One-click tailoring (LinkedIn):** on a LinkedIn job page, click **Tailor resume**. AnswerSnap
  reads the job, then makes a copy of your master resume aimed at it: the job's keywords in your
  own bullets, a matching summary and title line, the most relevant projects, all within two
  pages. The **Job match** tab shows the keyword score before and after, what could reject the
  application whatever the resume says (location, work authorization, years), and everything
  added that isn't in your resume, for you to keep or remove, and **what changed** from your master
  resume, word by word, each with an Undo. A cover letter comes with it. Your
  master resume never changes, and nothing is sent until you click. Set your **dealbreakers**
  (where you can work, remote only, visa sponsorship, lowest pay, titles or companies to skip) in
  Settings, and a job that hits one asks before anything goes to the AI.
- **Resume builder:** build your CV in a FlowCV-style editor, starting from your profile or by
  importing your resume (PDF, DOCX, or TXT, word for word). Add, hide, rename, and reorder
  sections, write with bold, italics, and bullets, and style everything (layout, columns, colors,
  headings, dates, skill levels, and FlowCV's fonts, bundled so the PDF looks the same on every
  computer) or pick one of 9 templates, or save your own.
  Write it in English, Italian, French, Spanish, or German, with the GDPR consent line Italian
  applications ask for. Download PDF saves real, selectable text that matches the preview page
  for page, and the **ATS** tab shows the text an applicant tracking system reads from it and
  what it would miss (it can also read back the PDF you downloaded). Open it from Settings or the
  Profile tab.
- **Application tracker:** every job post you save is tracked, from saved to offer, with notes
  and a CSV export.
- **Story bank:** your STAR stories, used first for "tell me about a time" questions.
- **Library:** answers you've used, reused when the same question comes up again.
- **Fact check** (optional): every sentence checked against your profile.
- **Answer confidently** (default) or **stick to my profile**: you choose whether answers fill
  gaps with modest claims (always listed as "Assumed" so you can check them) or leave
  placeholders.

## Planned features

Twelve features planned next, all built on the same rule as the rest: nothing about you is ever
invented. The running list, with what's done, is in [docs/ROADMAP.md](docs/ROADMAP.md).

**Getting past the filters**

1. **Hires-from-your-country check:** reads a job post for signs the company can hire you where
   you live ("contractor", "employer of record", "work from anywhere", or "must reside in the
   US"), so you don't apply where you can't be hired.
2. **Scam and ghost-job detector:** flags upfront fees, chat-app-only contact, pay too good for
   the role, vague posts, and very old reposts.
3. **LinkedIn profile consistency check:** compares your own LinkedIn profile with your master
   resume (titles, dates, skills), since hiring tools compare the two.

**A stronger resume**

4. **Bullet strengthener:** finds bullets with no result or number and asks you questions to fill
   them in.
5. **GitHub evidence import:** reads your public repositories and proposes project bullets and
   skills, with links as proof.
6. **Honest gap closer:** for must-have skills you lack across the jobs you save, suggests a
   small project that would let you claim the skill truthfully.
7. **One-page version:** a one-page cut of any resume that keeps the job's keywords.

**Beyond the application**

8. **Freelance proposal mode:** a short proposal for a freelance job post from your most relevant
   projects, with answers to the client's questions.
9. **Recruiter reply helper:** paste a recruiter's message and get replies about availability,
   salary, and time zone.
10. **Company brief:** from the company's own pages, what they do, their stack, and three talking
    points.
11. **What's working report:** which resume versions and keywords got replies, interviews, or
    rejections.
12. **Today's apply queue:** your saved jobs ranked by fit, dealbreakers, and age.

Features 3, 5, and 8 read another site or call another service, so each waits for the owner's
approval first (see "Needs Liben's OK" in the roadmap).

### For master's scholarships

Planned for the Study tab, which already fills personal details exactly, reads a call's
requirements, and keeps a document checklist. None of these needs a new permission, and passport
and ID details still never go to the AI.

**Finding and choosing**

1. **Am I eligible, across calls:** every call you've saved checked against your details
   (degree, grade, age, language test, country), ranked.
2. **Program fit:** a program's course page compared with your background and goals.
3. **Grade conversion:** your grade on the Italian /110, German, and ECTS scales, with the
   formula shown (unofficial: universities differ).

**Writing**

4. **Motivation letter writer:** a letter per program from your profile and that program's page,
   within the call's word limit, facts only.
5. **Study plan and research proposal outline** for calls that require one.
6. **Essay reuse and consistency:** an essay you wrote adapted to a new question and limit, and
   a check that all your essays state the same facts.
7. **Academic CV template:** Europass-style and academic layouts in the resume builder.
8. **Supervisor contact email** from a professor's page and your background.

**Managing the process**

9. **Scholarship tracker with deadlines** and reminders.
10. **Backwards timeline:** from a deadline, when to book the language test, request
    recommendations, and get documents legalised.
11. **Recommendation letter kit:** request emails to your referees, and a fact sheet for them.
12. **Document check:** each file against the call's format, size limit, and validity dates.

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
