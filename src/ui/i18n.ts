// UI strings go through chrome.i18n (spec 13.4) so translations can come later. English only in
// v1: messages live in public/_locales/en/messages.json, and the fallback keeps tests and
// Node-side code working where chrome.i18n doesn't exist.
export function t(key: string, fallback: string, ...substitutions: string[]): string {
  try {
    // WXT types getMessage to the generated key list; this helper takes any key and falls back.
    const getMessage = browser.i18n?.getMessage as
      ((k: string, s?: string[]) => string) | undefined;
    const message = getMessage?.(key, substitutions);
    return message || fallback;
  } catch {
    return fallback;
  }
}
