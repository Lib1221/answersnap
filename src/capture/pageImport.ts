// "Import this page into AnswerSnap" (spec 3.7 step 2): wait for the app to render, scroll to
// the bottom and back to trigger lazy content, then read the page's rendered text.

export const PAGE_TEXT_LIMIT = 100_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readPageText(
  scope: 'selection' | 'page',
): Promise<{ title: string; text: string; url: string }> {
  const base = { title: document.title, url: location.href };
  if (scope === 'selection')
    return { ...base, text: (window.getSelection()?.toString() ?? '').slice(0, PAGE_TEXT_LIMIT) };
  await wait(1500);
  const y = window.scrollY;
  window.scrollTo(0, document.documentElement.scrollHeight);
  await wait(400);
  window.scrollTo(0, y);
  await wait(100);
  return {
    ...base,
    title: document.title,
    text: (document.body?.innerText ?? '').slice(0, PAGE_TEXT_LIMIT),
  };
}
