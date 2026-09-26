# Decisions

Ambiguities in `SPEC.md`, deviations from it, and the option picked. One line each, with a reason.

## Spec pass (M0)

- Repo root is the existing `extension/` folder, not `answersnap/`. Folder name doesn't matter to the build.
- Node 25 is installed locally; spec says Node 22 LTS. `engines.node` is `>=22`, and CI will pin 22.
- TypeScript pinned to `~6.0` (not latest 7.x): typescript-eslint 8.x supports `<6.1` only.
- Vite 8 added as a dev dependency: WXT 0.21 lists it as a peer dependency.
- Icon source lives at `src/assets/icon.svg`, not `public/icon.svg`: auto-icons reads from `srcDir`, and anything in `public/` ships unused.
- pnpm 11 blocks install scripts by default. `pnpm-workspace.yaml` allows `esbuild` only.
- Extra scripts beyond spec 5.2: `postinstall: wxt prepare` (generates types) and `format` (Prettier).
- No `@types/chrome`: WXT's typed `browser` global is used everywhere, including the service worker.
- Manifest snapshot test builds with WXT's JS `build()` into a temp dir, so it catches anything WXT injects.
- E2E fixture accepts `E2E_CHROMIUM_PATH` because Playwright's browser download timed out here; branded Chrome 137+ ignores `--load-extension`, so it must be Chromium or Chrome for Testing.
- Section 4 says the panel "must not inject scripts itself" while section 8 has the panel message the capture script directly. Reading: messaging via `tabs.sendMessage` is fine; injection always goes through the SW.
- Dark mode follows `prefers-color-scheme` only. The spec defines no manual theme toggle.
- `_locales` and `default_locale` land in M7 with the i18n pass; adding `_locales` earlier forces `default_locale` in the manifest.
- Job context expiry (3.4, 12 h) is enforced by `createdAt` on read, since `storage.session` has no TTL. It also clears on browser restart, which is fine.
- `history.enabled = false` (7.2) means Insert and Copy stop auto-saving to the library; an explicit Save still saves.
- To verify against live docs before use: `max_tokens: 0` pre-warm (M4), `output_config.format` structured outputs (M3), minimum cacheable lengths and prices (M2/M4).

## M1 (capture)

- Added session key `captureStatus` (selecting, capturing, done, cancelled, error). The panel can open in the same gesture that starts the snip, so a `CAPTURE_ERROR` runtime message could arrive before it listens. Errors and progress go through this key instead.
- Added message `CANCEL_SELECTION` (panel to page): after a toolbar click the panel may hold focus, so Esc in the panel must also cancel the overlay.
- `START_SNIP` can also reply `INJECT_FAILED` (script injected but the page didn't answer), shown as "Reload the page and try again".
- `FieldInfo` gains optional `minLength` and `required`, since spec 9.7 lists them as constraints but the 7.2 type has no place for them.
- Capture options come from `src/config/defaults.ts` constants until the settings store lands in M2.
- Only the "Snip question" context menu exists so far. "Answer this field", "Use selection as job post", and "Import this page" arrive with M6 and M3.
- Text nodes with no layout box (display: none) are judged "in the region" by their nearest ancestor that has a box, so hidden text inside the selection still counts toward `hiddenTextChars`.
- A radio or checkbox counts as visible if the input or its label is visible (styled choice inputs usually hide the native input).
- Verified: `scripting.executeScript` fails on the extension's own pages ("Cannot access contents of the page"), even with `<all_urls>`. The practice page (Appendix A) therefore can't be snipped via injection. Plan for M7: the practice page runs the capture runtime itself and the SW sends `BEGIN_SELECTION` directly when the tab is our own practice page.
- A `captureStatus` older than 10 minutes is treated as abandoned and ignored by the panel.
- Fields inside iframes aren't detected yet; the iframe copy fallback lands with insertion in M5.
- Unit tests fake layout with `data-rect="x,y,w,h"` attributes (happy-dom has no layout engine). E2E covers real layout: DPR via `--force-device-scale-factor`, zoom via `tabs.setZoom`, no Playwright viewport emulation so `captureVisibleTab` matches the page's own pixels.

## M2 (AI connection)

- Added Google Gemini as a second provider at Liben's request (free-tier API access). No new permission: the Gemini API returns `access-control-allow-origin` for `chrome-extension://` origins (verified with a CORS preflight), so extension pages can call it directly. Production `host_permissions` still lists only `https://api.anthropic.com/*`.
- Gemini defaults: `gemini-3.8-flash` (answers) and `gemini-3.5-flash-lite` (fast), from Google's model docs in September 2026. The dropdown fills from the live `GET /v1beta/models` after Test key, so a renamed model shows up there.
- The Gemini free tier lets Google use requests to improve its products. The options page says so when Gemini is picked, and a "free tier" checkbox (default on) shows "Free tier" instead of a cost estimate.
- Gemini specifics: key in the `x-goog-api-key` header (never `?key=`), `streamGenerateContent?alt=sse`, one `systemInstruction` with the blocks in order (Gemini caches repeated prefixes implicitly, so `prewarm` is a no-op), `thinkingConfig.thinkingLevel: 'low'`, thought parts skipped. An invalid key comes back as 400 `API_KEY_INVALID` and maps to the same "key rejected" message as a 401. The free-tier 429 retry delay is read from `RetryInfo.retryDelay`.
- API keys live under `apiKey:anthropic` and `apiKey:gemini` (local or session) instead of one `apiKey` key, so switching providers keeps both keys.
- Settings add `provider: 'gemini'` and `geminiFreeTier`. Every settings field has a zod default; stored objects are merged over the provider's defaults before validation.
- v0 settings (for the migration test) are defined as the unversioned shape with the key inside the settings object; migrating moves the key to its own entry.
- Per-model request quirks, from Anthropic's current model docs: Sonnet 5 runs adaptive thinking when `thinking` is omitted, which would eat the 1,024-token answer budget, so it gets `thinking: {type: 'disabled'}`. Opus 5.5 can't disable thinking (400), so it gets `output_config.effort: 'low'` and a 4,096-token floor. Haiku 4.5 gets neither (it rejects `effort`). Gemini 3.x always thinks and thinking counts toward `maxOutputTokens`, so it also gets a 4,096 floor.
- Retries: "back off 1 s, 2 s, 4 s, max 3 tries" is read as three retries (four attempts in total). A dropped connection mid-stream (TypeError from the body reader) counts as a network error, retried only if no text streamed.
- Full SYSTEM_RULES, user-turn builder, limits parser, and refine/profile/transcribe prompt templates landed in M2 rather than M4, since the basic prompt needed them anyway. M4 still owns pre-warm scheduling, job context, refinements, and the eval run.
- Page-supplied text that looks like one of our tags (`</page_text>`, `<options>`) is neutralized with a lookalike `‹` before it goes into the user turn.
- `field_info` shows the input type with the kind, e.g. `kind: input (number)`, so the format rule has something to work with.
- Counters like "0/1000" are read from field hints only: in question text the same pattern matches dates such as "09/2026".
- Until resume import (M3), the options page has a "Profile" box whose text is saved as a `note` source labeled "Pasted profile".
- The 400 image-size retry resizes the image in the side panel (it holds the image) to a 1,092 px long edge as JPEG and retries once.
- The mock LLM server picks error scenarios by API key (`bad-key`, `rate-limit-key`, `overloaded-key`, `slow-key`) and canned answers by keywords in the conversation only (the system blocks contain the resume).
- Anthropic "Get a key" link points at console.anthropic.com/settings/keys; Gemini at aistudio.google.com/apikey.

## M3 (knowledge base)

- Live Gemini checks with Liben's key (September 25, 2026). The key was never written to the repo. `gemini-3.8-flash` and `gemini-3.5-flash-lite` both exist. `thinkingLevel: 'minimal'` returns a 400 on 3.8 Flash, so it stays at `low`. The free tier allows 5 requests a minute on 3.8 Flash, and the panel now says so in plain words. `responseJsonSchema` produced a valid CandidateProfile on the first try. 3.8 Flash handled the assessment, missing rate, Kubernetes, and hidden-instruction questions correctly. Flash-Lite added details that weren't in the resume, so it stays the fast model (summaries, transcription) and is not suggested for answers.
- Model list filter also drops `omni` (video) and `customtools` variants, which appeared in the live list.
- Gemini keys can start with `AQ.` as well as `AIza`; both are redacted from error messages.
- liben.dev (spec 3.7) is not text-poor to a plain fetch: the home page gives about 2,600 characters, including the meta description and JSON-LD Person data inside `@graph`, so no fallback is shown. `/resume` and `/llms.txt` return 404 to a direct fetch (the resume page only exists after the React app loads), so `/resume` has to come in through "Import this page into AnswerSnap". The home page links to `/resume.pdf`, which the importer offers to download. Its real text extracts cleanly (2 pages, header and footer lines removed); this was checked locally only.
- liben.dev redirects to www.liben.dev. Website import therefore asks for the www/apex twin origins together in one prompt; with only one of them, the redirected fetch would fail.
- Tab import review distinguishes "Chrome refused" (`failed: true`) from "the page has no DOM text" (canvas or WebGL), which gets the "Read with AI" offer.
- "Read with AI" for a page reuses the activeTab grant from the "Import this page" menu click: options sends `START_SNIP` with mode `import`, the SW brings the tab to the front, and options takes the resulting capture (`takePendingCapture` now takes a list of modes so the side panel never grabs an import snip). Import and job snips skip context padding.
- Import snips always capture an image, even when "send screenshot" is off, because the image is the whole point of that mode.
- Structured-output fallback: Anthropic retries a 400 with tool use, forced (`tool_choice: tool`) on most models and `auto` plus an instruction on Opus 5.5 and Fable 5.1, which reject forced tool use. Gemini retries a 400 in plain JSON mode with the schema in the system instruction. The result is always validated with zod, with missing arrays filled from an empty profile.
- pdf.js 6 has no eval code path (no `new Function(` in the bundle) and dropped the `isEvalSupported` option, so it isn't passed.
- Header and footer stripping looks at the first and last 3 non-empty lines of each page and masks digits before comparing, so "Page 1/2" and dated print headers match. A short last page still works because its header sits inside that window.
- Profile objects are cloned through JSON, not `structuredClone`, because Vue's reactive proxies can't be structured-cloned.
- The M2 "Profile" paste box became a regular "Add note" in Sources. Existing pasted text stays as a note source.
- Rebuild comparison defaults to "Keep mine" for every changed section once the user has edited the profile, otherwise to "Use new".
- Fixture resumes (Jamie Park only) are generated by `tests/fixtures/resumes/generate.mjs` with Chromium: a printed PDF with browser-style header and footer, an image-only "scanned" PDF, DOCX, TXT, and MD. Liben's real resume text is not in the repo.
- Fixture server: port 4611 has no llms.txt, so it can stand in for a JS-only site; directory paths serve index.html.

## M4 (answer quality)

- "Read whole page" for job context does not run Readability on the page's HTML, as spec 3.4 suggests. Raw HTML includes hidden text, and job posts are where hidden "if you are an AI" traps live. The capture script reads the whole page through the same visibility filter as question snips instead. "Use selected text" goes through that filter as well.
- Job snips capture up to 20,000 characters of visible text (questions keep 4,000). If a job snip has under 200 characters of text (a canvas or image post), the fast model transcribes the image.
- The job summary prompt adds one sentence to JOB_SUMMARY: start with a "<role title> at <company>" line, which the chip reads. Without a summary (posts under 6,000 characters), the chip uses the page title minus "| Careers" style suffixes.
- The job context key is the hostname of the latest question capture or the active tab (when the panel can see its URL).
- Job and import snips don't replace the question card or show the panel's "Select the question" state; job snip progress shows in the job bar.
- Added `ENSURE_CAPTURE` (panel to SW): the panel may message the page only after the SW injects the capture script (spec 4, 8).
- Refinements resend the first user turn (with the screenshot) unchanged, then the assistant turn with the user's edited answer swapped in, then the instruction. No thinking blocks are ever replayed, so the preserved-thinking checks on Opus 5.5 don't apply. Tone refinements are two buttons ("More formal", "More casual") rather than a menu.
- "Cut at last sentence" (spec 12) is available whenever the answer is over the limit, next to "Fit limit".
- Pre-warm also re-runs when the system blocks change (a hash of their text is stored with the model and time), because an edited profile wouldn't match the warmed cache. Anthropic only.
- Missing-info chips map to standard answer fields with keyword rules (rate, salary, sponsorship, authorization, notice, start date, time zone, overlap, relocation, remote, hours, English), otherwise open a new custom question prefilled with the item.
- Added an options "Writing style" section now (tone, length, answer language, style rules with reset), since M4 owns style rules and length.
- `import.meta.env` is read with `?.` in `defaultSettings()` so the eval runner can import app code in plain Node.
- Eval checks: numbers not found in the candidate data, and the answer type, are flags for manual review (spec: don't auto-fail). The language check ignores `[[placeholders]]` and passes when the language can't be told apart.
- Live finding: Gemini's free tier caps `gemini-3.8-flash` at 20 requests a day (quota `generate_content_free_tier_requests`, limit 20) on top of 5 a minute. Quotas are per model, so the panel's free-tier message now suggests switching to another Gemini model or a paid key. The daily cap was used up during M3/M4 testing, so the M4 eval ran on `gemini-3.7-flash`.
- E2E: `seed()` reloads the panel after writing storage, and seeded settings turn pre-warm off unless a test asks for it. Otherwise the panel's mount-time reads race the seed, and a pre-warm request shifts the mock log.
- Gemini default answer model is `gemini-3.5-flash` (Liben's call; it has its own free-tier quota and the same paid price as 3.8 Flash). 3.8 Flash stays in the list.
- Requests now time out: 60 s for a streamed response to start, 180 s for non-streamed ones (they generate everything first), and a stream that sends nothing for 60 s counts as a dropped connection (retried once if no text has shown yet). Found when a live eval request hung with no data; without this the panel would sit on "Drafting" forever.
- The eval runner retries a question twice after quota or "busy" errors, waiting 65 s each time (free-tier per-minute windows).

## M5 (insertion)

- Rich editors are blurred after an insert (spec says so for inputs). Found in E2E: a still-focused editor won the next snip's "focused field" rule (score 1000), so the next answer targeted the previous field.
- Iframes that are visible and at least 40 x 20 px count as field candidates with `inIframe: true`; a focused iframe (the user clicked into a field inside it) wins as "focused". Insert on them goes straight to the copy fallback (v1 fills the top frame only).
- Contenteditable insert order: select (all for Replace, caret at end for Append), `execCommand('insertText')`, re-do paragraph by paragraph if the editor dropped the line breaks, else a synthetic paste. An Append that half-applied fails verification instead of pasting a second copy.
- Highlight, flash, and the field picker draw in their own closed shadow root and never change page elements' styles.
- If the capture script is gone (page reloaded), the panel asks the SW to inject it again. Field ids from the old page no longer resolve, so Insert says "The page changed since the snip. Pick the field again, or copy the answer."
- The clipboard can refuse writes when the panel isn't focused; the copy fallback then tells the user to copy the text by hand instead of claiming it was copied.
- The Insert split button: "Replace" (default) plus a ▾ that shows "Append", only when the field already has content. With no text field (dropdown, radios), Copy becomes the primary button until choice fields arrive in M6.
- Test-only dev dependencies for fixtures: react, react-dom, quill, and esbuild (bundles the React fixture when the fixture server starts). Vue's browser ESM build comes from the existing runtime dependency. Nothing is loaded from a CDN.

## M6 (library and more entry points)

- Library matching compares the snipped text (first 400 characters) against each saved entry's question, which is the model's one-line reading of the question when there was one.
- The same question on the same site updates the earlier library entry (and its use count) instead of adding a duplicate.
- After Reuse there is no model conversation, so the refine buttons are hidden; Adapt or Regenerate start one.
- A library row that fails validation is dropped on read instead of discarding the whole library.
- "Answer this field": the SW reuses `BEGIN_SELECTION` with mode `field`; the capture script uses the focused field (Chrome focuses text fields on right-click). If nothing fillable is focused, it falls back to a normal snip overlay rather than guessing. The crop has no padding and outlines the field (`REGION_SELECTED.outline`). The field's label is prepended to the page text when the region text doesn't include it.
- "Use selection as job post": the SW reads the selection through the capture script's visibility filter (Chrome's `selectionText` can include white-on-white text) and writes `session:pendingJob`; the panel builds the job context, since only the panel may call the model (spec 4).
- Choice fields: checkbox answers are split on commas and new lines; radio and select take the whole answer. With no match, the panel says so and nothing is clicked. The primary button reads "Select" for choice targets.
- "What gets sent" shows the last request from `session:lastRequest` with the screenshot described ("Screenshot, W x H px (not stored)") instead of a thumbnail, since storing a thumbnail would conflict with hard rule 3.
- Export includes settings (minus the dev-only base URL), sources, profile, standard answers, and library; never API keys. Import replaces those and leaves keys alone.
- "Delete all data" clears local and session storage and removes every host permission not in the manifest's required list.
- The eval runner skips the remaining questions after three in a row fail on quota, and still writes the report.

## M7 (polish)

- The service worker first offers `BEGIN_SELECTION` to a capture runtime that may already be listening, and injects only if nothing answers (`ENSURE_CAPTURE` uses a `PING`). This is how the practice page works: it runs the capture runtime itself because Chrome won't inject into extension pages. Extension page URLs aren't visible to `tabs.query`, so URL checks alone couldn't recognize it. The extension's own origin is no longer "restricted". Verified in E2E that the screenshot works on the practice page (e2e build); still to confirm with a real gesture in the production build (docs/QA.md).
- Install opens `options.html#welcome` (Getting started checklist). "Try it" marks onboarding done and opens the practice page.
- Panel tabs: Answer, Library, Profile. The header shows "Profile ready: resume + 1 site" style status.
- i18n scaffolding: `public/_locales/en/messages.json`, `default_locale: en`, manifest name, description, and command via `__MSG_*__`, context menus and the panel's main states through `t(key, fallback)`. The rest of the UI strings move over as translations are added; English only in v1. The action title stays literal because it embeds the shortcut.
- Budgets are tests: the production build test checks capture.js < 40 KB and the side panel's up-front JS < 400 KB gzipped (it's about 60 KB) with no pdf.js or mammoth; an E2E test checks overlay < 150 ms after the trigger and region to thumbnail < 400 ms (measured 21 ms and 327 ms headless).
- Accessibility: axe-core (dev dependency) scans the panel, every options section, and the practice page in light and dark mode for WCAG 2 A/AA. The practice page's white-on-white trap is excluded on purpose.
- The manual QA checklist (spec 16.3) is in `docs/QA.md`; it needs real sites, real gestures, and HiDPI or Windows scaling, which the E2E suite can't do.

## M8 (release)

- Version 1.0.0. `packageManager: pnpm@11.22.0` in package.json so CI installs the same pnpm.
- CI (`.github/workflows/ci.yml`) runs on Node 22 LTS: typecheck, lint, unit, Playwright E2E with Playwright's own Chromium, then `pnpm zip` as an artifact. A `v*` tag also creates a GitHub release with the zip.
- Store screenshots are generated by `tests/e2e/store.spec.ts` (skipped unless `STORE_SHOTS=1`): the practice page and the real side panel side by side at 1280 x 800, the Getting started page, and a 440 x 280 promo tile. Fictional Jamie Park data only.
- The store copy and privacy policy name both providers (Anthropic or Google Gemini) and say plainly that Gemini's free tier lets Google use requests to improve its products.
- `docs/PRIVACY.md` has a `[contact email]` placeholder. It's Liben's call which address to publish.
- Checked: the built zip installs in a fresh Chrome profile, opens Getting started, and loads the panel, options, and practice page with no console errors; production `host_permissions` are only `https://api.anthropic.com/*`.
- Found while taking screenshots: the Profile tab had silently not been added in M7 (an edit didn't apply); fixed, with an E2E check that the panel has all three tabs.
- Eval on `gemini-3.5-flash` (September 25, 2026): questions 1 to 6 answered and passed every automatic check before the free tier's daily cap stopped the run. Manual read: #2 embellished ("struggling under heavy load" isn't in the resume, and it tied the 2 million requests to the wrong service). The full 20-question release bar still needs a run with fresh quota or a paid key, ideally Anthropic Sonnet 5 as well (which also verifies cache reads on the second answer).
- CI gets 3x slack on the latency budgets (a GitHub runner measured 799 ms region to thumbnail against 327 ms locally); local runs keep the spec's 150 ms and 400 ms.

## After v1: automatic model fallback

- Gemini's 429 includes `google.rpc.QuotaFailure` with a quotaId like `GenerateRequestsPerDayPerProjectPerModel-FreeTier` (captured live September 25, 2026). The daily case also says "retry in 15s", which is misleading, so a daily quota error is never retried on the same model.
- `FallbackProvider` wraps the configured provider (Gemini only; Anthropic limits are per account, so switching models wouldn't help). On a quota error it puts the model on cooldown (until midnight Pacific time for daily quotas, 65 s for per-minute ones) in `local:modelCooldowns` and retries on the next model in the chain. Later requests skip models that are cooling down.
- Answer chain: 3.5 → 3.6 → 3.7 → 3.8 Flash, starting from the chosen model. Fast chain: 3.5 Flash-Lite → 3.1 Flash-Lite → Flash-Lite latest. Answers never fall back to Flash-Lite (it added details that weren't in the resume in live tests). Chains are filtered to the models the key can use (saved on Test key as `availableModels`).
- The panel says which model answered and why ("Gemini 3.5 Flash reached its daily free limit, so this answer uses Gemini 3.6 Flash."); settings list the chain with each model's status. When every model is out, the message says when they come back.
- Test key no longer picks the first listed model when the saved one is missing (that was Gemini 2.5 Flash, restricted for new users); it picks the recommended default, and the dropdown lists recommended models first.
- E2E fixes: `seed()` also clears session storage; the latency test waits 1.1 s between its warm-up and measured snips, because `captureVisibleTab` allows about 2 calls a second and the throttle, not the extension, caused the occasional 850 ms reading.

## After v1: fact-check pass

- After each drafted answer and refinement, a second request checks the answer sentence by sentence against the candidate block (the same text the answer used, with its own cache breakpoint). The extension splits sentences (`Intl.Segmenter`) and the model returns verdicts by number, so flags map back exactly.
- Claim by claim: for each sentence the model lists every claim (actions, numbers, tools, the situation before, the reason, the result) with an exact quote from the data or null. Any null quote makes the sentence unsupported, whatever the model's own verdict. The first design (one verdict per sentence) missed the real embellishment from the M4 eval on Gemini Flash-Lite; the claim version flagged it on both Flash-Lite and 3.6 Flash and flagged nothing on a clean answer (live test, September 25, 2026).
- Checks run on the fast model by default (cheap, and on Gemini a separate free quota from the answer model); a setting switches to the answer model. Automatic fallback applies to checks too.
- Skipped for value answers (number, yes/no, choice, URL, date, salary, assessment), answers under 40 characters of prose, and Reuse. Never blocks Insert. Editing the answer marks the check stale with a "Check again" button.
- "Fix it" is a refinement (`fix-facts`) that lists the flagged sentences and their issues; the rewrite is checked again automatically.
- `pnpm eval --fact-check` runs the same check on prose answers and marks unsupported sentences for review in the report.

## After v1: fill the whole form

- Scan every visible field in document order (top frame, max 40, skipping fields with no label, placeholder, or hint). Fields that already have a value start unticked.
- One request drafts every ticked field (20 per request; more makes a second request) with `renderBatchRules`: the same hard and style rules as single answers, with a JSON reply per field id via structured outputs. The single-answer rules stay byte-identical (snapshot tests unchanged). No screenshot in batch mode.
- Saved answers that closely match a field are reused without asking the model, but essays only from the same site (so "why Acme" never lands in Globex's form); short answers (links, numbers, choices) are reused anywhere.
- Single-choice answers are snapped to the exact option label (shared `matchOption`, moved to `kb/similarity`), so the review dropdown and insertion agree.
- Backstop for skills tests: questions that look like code or quiz items ("what does this print", "time complexity", code snippets) get no answer even if the model drafts one. Found live: Gemini 3.1 Flash-Lite answered "What does this print?" in batch mode.
- Review before insert: editable answers, choice dropdowns, placeholders and test items unticked, per-field ✓ or ✗ after inserting. Never submits (E2E checks the form's submit handler never ran).
- Entry points: the panel's Form tab ("Scan this form"), and a new "Fill this form with AnswerSnap" context menu (page and editable contexts), which also grants activeTab.
- Bug found by this feature: `hintFor` took the next field's label as a field's helper text (a label below a field belongs to the next field). Fixed for single snips too.
- `neutralize` now also covers `fields`, `field`, `placeholder`, `current_value`, and `answer_sentences`, so page text can't close the batch or fact-check tags.
- Live check (September 25, 2026): 9 fields drafted in one Gemini request in 8 s; name, email, years, placeholder rate, choices, and checkboxes correct.

## After v1: UI refresh

- Liben asked for a modern look plus a credit and a GitHub star link. Kept the spec's identity (ink blue, crop-mark logo, canary question card, Public Sans) and moved to an app-style layout: soft background surface, white cards with hairline borders and a light shadow (spec 13.1 said no shadowed cards; changed at Liben's request), 8 px controls and 12 px cards, segmented tabs with icons, chip-style refine actions, key-cap shortcut, empty-state cards, sidebar navigation with icons in settings, and green success states.
- Icons are hand-drawn SVG paths in `src/ui/AppIcon.vue` (no icon library, since runtime dependencies need approval). The GitHub mark is used only to link to the project's repository.
- Credit: "Made by Liben" and "Star on GitHub" (links to `BRAND.repoUrl`) in the side panel footer and the settings sidebar; author and repo URL live in `src/config/brand.ts`. The repository is still private, so the star link works only for people with access until it's made public.
- Color transitions (120 ms) respect reduced motion. The axe test runs with reduced motion so it measures settled colors instead of mid-fade ones.
- "Answer confidently" (`settings.fillGaps`, off by default): Liben found placeholders and "no experience with X" answers blocking. When on, the fact rules change: never admit a gap, claim about 1 year of hands-on experience (or the minimum the job states) for skills not in the data, answer Yes to have-you-used questions, and list every assumption in the notes as "Assumed: ...", which the panel shows in yellow. Legal and checkable facts (work authorization, visa, degrees, certifications, licenses, criminal record, references, contact details, salary, start date) still become placeholders. Invented claims stay general, never tied to a real employer from the data. The automatic fact check is skipped in this mode because it would flag every assumption on purpose. Default stays "stick to my profile" (spec 2.1) for anyone else who installs it.
- "Answer confidently" is now on by default (Liben kept getting "I have not worked directly with X" answers with the setting off). The rule names those hedges word for word, and Fill form no longer reuses saved answers that admit a gap while this mode is on. Checked live on Gemini 3.6 Flash with the Jamie Park fixture: CUDA gets "about a year of hands-on experience", "3+ years of Kubernetes?" gets Yes, and work authorization stays a placeholder.
- The model-cooldown storage item in `src/llm/fallback.ts` is now created on first use: `storage.defineItem` touches browser storage right away, which crashed `pnpm eval` in Node after the fallback feature landed.
- Default Gemini answer model is now Gemini 3.1 Flash-Lite (Liben asked). It heads the answer fallback chain (then 3.5 to 3.8 Flash) and left the fast chain so the two don't share quota. Checked live with the confident rules: same behavior as 3.6 Flash. Gemini 3.1 Pro Preview has a free-tier limit of 0, so it isn't an option on a free key.
- Cover letters (Liben asked for a place to fill in a cover letter and a cover letter section). Settings > Cover letter saves the user's own letter as a source of a new kind, `cover-letter`, so it goes into the candidate block like any source: answers can use its facts and voice with no new prompt tag, and it shows (and can be turned off) in Sources. The side panel's new Letter tab drafts a letter for the site's saved job post by running the answer engine with a letter request as the question, its own length (short, standard, long: about 200, 300, or 400 words), a 4,000 character limit, and at least 2,048 output tokens; so streaming, confident mode, refine, Copy, Pick field, and Save all work unchanged. Cover letter fields snipped on a page or filled with Fill form get a letter-sized answer (about 300 words) unless the field states a limit. Checked live on Gemini 3.1 Flash-Lite: greeting with the hiring manager's name from the job post, the sample's voice, the job's stack, and assumptions listed in the note.
- Roadmap in `docs/ROADMAP.md` (Liben asked for a to-do list and at least five major features built without waiting for answers). Picked features that need no new permissions, dependencies, or endpoints; the ones that would (reminders via alarms and notifications, Ollama/OpenRouter) are listed as needing Liben's OK.
- Job tab: the Letter tab became "Job", with sub-sections (Letter first, since that's what Liben asked for last), so the panel stays at five tabs. Sub-section buttons use `aria-pressed`, not `role="tab"`, so the panel's one tablist stays unambiguous.
- Job fit check: structured JSON (like the fact check), always honest regardless of "Answer confidently" because it's advice to the candidate, not text sent to employers. The verdict label is computed from the score so they can't disagree; requirements are sorted must-haves first and gaps first. Results are cached per job post for the session.
- Interview prep: 8 likely questions (3 behavioral, 2 technical, 2 role, 1 motivation) as structured JSON, each with why it's asked, a suggested first-person answer (STAR for behavioral), and a tip. Unlike the fit check, the answers are things the candidate will say, so they follow "Answer confidently" and style rules; assumed experience is flagged per question. Answers can be saved to the Library (page title "Interview: ...").
- Follow-up emails (Job > Email): six kinds (thank-you, follow-up, check-in, accept, decline, withdraw), drafted by the answer engine like cover letters so refine, copy, and save work. The first line is "Subject: ..."; "Open in email app" builds a `mailto:` link, so the email goes to the user's own mail client and nothing is sent anywhere new. The letter and email tools share `activeTabRequest` for their synthetic capture.
- Application tracker: saving a job post (any of the three ways) calls `trackJob`, keyed by site and role, so re-saving refreshes instead of duplicating. Status history is kept per application for the CSV ("Applied" date). Stored in `local:applications`, included in export/import (optional field, so older backups still import) and cleared by Delete all data. Never sent to the AI provider. Settings > Applications is second in the nav because it's a dashboard; the default view hides rejected and withdrawn. CSV export uses a Blob download, so no `downloads` permission.
- Story bank: STAR stories are sources of kind `story` (label "Story: <title>", text as labeled lines that parse back into the editor), so they flow into every prompt with no new tag and show in Sources with an on/off switch. A new shared rule (appended last, so existing rule numbers hold) tells answers to prefer a fitting story for "a time when" questions; interview prep already prefers them. "Suggest stories from my resume" drafts four stories with honest rules (facts from the data only) regardless of answer mode, since the stories become source data; incomplete drafts are dropped and each one needs Keep before it's saved.
- Answer versions instead of side-by-side variants: generating two or three drafts up front would triple requests on a 20-a-day free tier. Instead every draft and refinement is kept as a version (text, raw output, and conversation history), with a switcher above the answer; refining from an earlier version builds on that version's history. New "Another angle" refinement asks for a different example or angle at the same length.
- Resume tailoring (Job > Resume): rewrites keep every fact, number, employer, and tool; the job post's wording is used only where true. New bullets for gaps exist only in "Answer confidently" mode, at most 2, and are forced to "assumed" in code (a bullet without an original is always flagged, and dropped entirely in stick-to-profile mode) so a model slip can't hide an invention. Shared `useJobTool` holds the per-job caching that fit and interview prep repeat; new job tools use it.
- Job tools switcher is a five-column segmented control, and the page reserves the scrollbar gutter: wrapped chips made the panel oscillate (wrap, scrollbar appears, narrower, re-wrap), caught by an E2E test that never saw the button settle.
- LinkedIn writer (side panel Profile tab): three headlines under 220 characters, a 150 to 250 word About, and skills to feature, optionally aimed at a target role. Facts only in every answer mode, because a LinkedIn profile is public and checkable by colleagues. `target_role` joined the neutralized tag list.
- The accessibility test now also scans Applications, Cover letter, and Stories, and has a 120 s timeout: a dozen axe scans ran 20 to 26 s alone and timed out under parallel load.
- Follow-up radar: "no news" counts from the last status change or the last "Mark followed up" (new optional `followedUpAt`, so older data still parses), not from `updatedAt`, which notes edits and re-saving the job post also touch. Thresholds: 7 days after applying, 5 while interviewing. Reply rate (heard back: interview, offer, or rejection, over everything ever applied) shows from 3 applications, since a percentage of 1 or 2 is noise. The panel nudge opens Job > Email preset to "Follow up after applying" (or "Check in" while interviewing). No reminders or notifications: those need the `alarms` and `notifications` permissions, which are Liben's call.
- Panel shortcuts use `KeyboardEvent.code` (Digit1, KeyC, ...) so Option+key on a Mac, which types special characters, still works. Copy, regenerate, and versions act on the Answer tab only; `?` is ignored while typing. Regenerate, Adapt, and Write new now reuse the last run's options: before, Regenerate on a cover letter or email reran it as a 120-word answer with a 2,500 character limit.
- Follow-up reminders: Liben approved the `alarms` and `notifications` permissions on 2026-09-26 ("do all of them", after being told Chrome shows them at install). An alarm checks every 6 hours using the radar's rule and notifies once per quiet spell (keyed by the application's last activity, stored in `local:remindedFollowUps`); clicking opens Settings > Applications. On by default, with a switch on the Applications page. Store listing and privacy policy updated with the justifications.
- OpenRouter and Ollama (Liben approved 2026-09-26): one OpenAI-compatible client (`src/llm/openaiCompat.ts`) for both. No manifest change after all: OpenRouter allows browser requests, and Ollama is reached through the existing optional `<all_urls>`, requested for the Ollama host inside the Connect click. Ollama still rejects extension origins unless started with `OLLAMA_ORIGINS=chrome-extension://*`, so Settings says so and a 403 explains it. Ollama needs no key: `getApiKey('ollama')` returns a placeholder that the client never sends. OpenRouter defaults to `openrouter/auto` (always valid) until Test key loads the real list; Ollama defaults to `llama3.2`. Structured output uses `response_format: json_schema`, with a schema-in-prompt retry for models that refuse it. Ollama counts as free (no cost line). OpenRouter keys and bearer tokens are now redacted from errors.
- Multi-page applications: answers saved on the same site in the last 24 hours (the Library already records every inserted, copied, or saved answer) go into single answers and Fill form as `<earlier_answers>`, at most 8, newest first, excluding the question being answered and the similar-answer examples already sent. Keeps facts consistent across pages and avoids retelling one story. No new storage; the privacy policy lists it.
- Sync across devices (approved by Liben 2026-09-26 with the rest of the roadmap): opt-in, through `storage.sync`, so the data goes to the user's own Google account and nowhere else, with no new permission. Chrome allows about 100 KB total and 8 KB per item, so only small hand-made data syncs: settings (never API keys, `baseUrl`, or the sync switch itself), profile, standard answers, stories, the cover letter, and applications. Resume and website sources and the Library stay local (too big, and re-importable). The bundle is gzipped with the built-in CompressionStream (no dependency), base64'd, and split into 7,000-character chunks plus a meta item (device id, hash). The service worker pushes 3 s after local changes when the hash differs, and pulls when another device's meta changes; applications merge by id (newer wins, nothing dropped), everything else is replaced. The first time sync is turned on and another device's copy exists, the user picks which data wins, so a fresh computer can't wipe a real profile with blank defaults.
