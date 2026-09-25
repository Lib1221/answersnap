# Manual QA checklist

Run before every release (spec 16.3). Automated coverage is in `tests/e2e` (Playwright, mock AI);
this list is what needs real gestures, real sites, and real keys.

Setup: `pnpm build`, load `.output/chrome-mv3` unpacked in a fresh Chrome profile, add a real API
key, import a resume, build the profile.

## Displays

Run the core flow (shortcut, drag, answer, Insert) on each:

- [ ] Windows at 100% display scaling
- [ ] Windows at 125% display scaling
- [ ] A HiDPI screen (Mac Retina or 200%)
- [ ] Page zoom 80% and 150%
- [ ] Dark mode (OS setting): side panel, options, practice page, overlay

## Real gestures

- [ ] Alt+Shift+Q starts a snip and opens the panel
- [ ] Toolbar icon starts a snip and opens the panel
- [ ] Right-click "Snip question", "Answer this field", "Use selection as job post", "Import this page into AnswerSnap"
- [ ] Panel "Snip question" on a page with no grant shows the shortcut hint and "Allow snipping from the panel on all sites"
- [ ] chrome://extensions and the Chrome Web Store show "Chrome doesn't let extensions read this page."
- [ ] The practice page (Getting started, step 7) can be snipped with the shortcut, including the screenshot

## Application sites

For each: snip two questions, insert, check the value stuck (click away, come back, submit button enabled).

- [ ] Turing application flow
- [ ] Upwork proposal form
- [ ] Greenhouse
- [ ] Lever
- [ ] Workday
- [ ] Ashby
- [ ] Google Forms
- [ ] Typeform
- [ ] LinkedIn Easy Apply
- [ ] One university scholarship portal

## Imports

- [ ] A two-column PDF resume (check the extracted order; fix in review if needed)
- [ ] A DOCX resume
- [ ] A scanned PDF ("Read with AI")
- [ ] Website import on liben.dev: home page text found; `resume.pdf` offered; `/resume` fails visibly and "Import this page" works on it
- [ ] Website import on a plain static site

## Conditions

- [ ] Slow network (DevTools throttling "Slow 4G"): streaming still readable, Stop works
- [ ] Keyboard only: shortcut, arrows are not needed for the overlay (click-to-pick with mouse is the only mouse step), Tab through the panel, Ctrl+Enter inserts, Esc stops
- [ ] Gemini free tier: after the per-minute limit, the panel says so plainly

## Last

- [ ] `pnpm eval` with a real key: every automatic check passes on the fixture profile, and a read of `evals/report.md` finds no invented facts
