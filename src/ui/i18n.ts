// UI strings go through chrome.i18n (spec 13.4); Chrome picks the language from its own UI
// language. Every call is t('key', 'English', ...substitutions) with $1..$9 for the
// substitutions. `node scripts/i18n.mjs` builds public/_locales from these calls (English) and
// src/locales/<lang>.json (translations). The fallback keeps tests and Node-side code working
// where chrome.i18n doesn't exist.
export function t(key: string, fallback: string, ...substitutions: string[]): string {
  try {
    // WXT types getMessage to the generated key list; this helper takes any key and falls back.
    const getMessage = browser.i18n?.getMessage as
      ((k: string, s?: string[]) => string) | undefined;
    const message = getMessage?.(key, substitutions);
    return (
      message || fallback.replace(/\$(\d)/g, (_, n: string) => substitutions[Number(n) - 1] ?? '')
    );
  } catch {
    return fallback.replace(/\$(\d)/g, (_, n: string) => substitutions[Number(n) - 1] ?? '');
  }
}
