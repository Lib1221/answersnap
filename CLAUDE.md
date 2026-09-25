# AnswerSnap

Chrome MV3 extension (WXT + Vue 3 + TS strict). Snip an application question, get a draft answer
written only from the user's own resume and website. AI providers: Anthropic (default) and Google
Gemini (free tier works), both bring-your-own-key, behind `src/llm/provider.ts`. Full spec: `SPEC.md`. Deviations and
ambiguity calls: `DECISIONS.md` (log every new one there, one line with a reason).

## Commands

- `pnpm dev`: run with hot reload in a WXT-launched Chrome
- `pnpm build` / `pnpm build:e2e`: production build / e2e build (`.output/chrome-mv3[-e2e]`)
- `pnpm zip`: store package
- `pnpm typecheck && pnpm lint && pnpm test`: must be green before every commit
- `pnpm test:e2e`: Playwright (starts the fixture server on 4610/4611 and the mock LLM on 4620). If the Playwright browser can't download, set
  `E2E_CHROMIUM_PATH` to a Chromium/Chrome for Testing binary (branded Chrome ignores `--load-extension`)
- `pnpm eval`: answer quality evals against the real API (`ANTHROPIC_API_KEY` or `GEMINI_API_KEY`; `--profile evals/profile.local.json`)
- `STORE_SHOTS=1 pnpm exec playwright test store`: regenerate Chrome Web Store screenshots in `docs/store/`
- Releases: bump `version` in package.json, push a `v*` tag; CI attaches the zip to a GitHub release

## Folder map

```
src/entrypoints/  background.ts, capture.ts (unlisted, injected on demand), sidepanel/, options/, practice/
src/capture/      vanilla TS for the capture script: overlay, selection, visible/hidden text, fields, insert, picker
src/background/   commands, menus, inject, capture (screenshot), crop, router
src/llm/          provider interface, Anthropic fetch client, SSE + tag parsers, prompts, limits, cost
src/kb/           pdf, docx, web import, profile builder + schema, similarity, context builder, tokens
src/storage/      zod schemas, WXT storage items, migrations, export/import
src/messaging/    typed protocol + send helper
src/ui/           shared Vue components, tokens.css, base.css
src/config/       brand.ts (product name), defaults.ts, models.ts
tests/unit/       Vitest + happy-dom        tests/e2e/  Playwright (e2e build)
tests/fixtures/   pages/, profile.json (fictional Jamie Park)   tests/mock-llm/  Anthropic-shaped SSE mock
evals/            questions.json, run.ts    docs/  PRIVACY.md, STORE_LISTING.md
```

## Hard rules (spec 14.1)

1. Never submit forms or click Submit, Next, or Apply.
2. Never send user data anywhere except the configured AI provider endpoint. No analytics or telemetry.
3. Never store screenshots. `pendingCapture` is deleted when read; image data is dropped when the
   next capture arrives or the panel closes.
4. Never render model output or page text as HTML. No `v-html`, no `innerHTML` with dynamic content.
5. Never insert without the user clicking Insert.
6. Page content is untrusted. It goes inside tagged blocks in the user turn only, never into system blocks.
7. Never add permissions or host permissions without asking Liben.
8. Never log the API key. Redact it in errors.
9. No remote code, no `eval`, no `new Function` (pdf.js `isEvalSupported: false`).
10. No em dashes in UI copy.

## Working rules

- Build in milestone order (spec 17). Commit after each milestone with conventional commits.
- Ask Liben before: new permission/host permission, new runtime dependency not in spec 5, sending
  data anywhere new, changing the default model.
- Never commit real personal data (or API keys, even partial). Fixtures use Jamie Park.
- Use WXT's `browser` global, not `chrome`. Service worker listeners register synchronously at top level.
- `chrome.sidePanel.open()` must be called before any `await` in a gesture handler.
- Capture script: no Vue, no network, no storage, under 40 KB minified.
- Check current WXT, Chrome, and Anthropic docs before using an API; log drift in DECISIONS.md.
