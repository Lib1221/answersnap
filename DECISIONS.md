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
