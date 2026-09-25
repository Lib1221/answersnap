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
