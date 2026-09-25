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
