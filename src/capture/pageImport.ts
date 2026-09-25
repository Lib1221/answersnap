import { createVisibilityChecker } from './hiddenText';
import { extractVisibleText, walkTextNodes } from './visibleText';

// "Import this page into AnswerSnap" (spec 3.7 step 2): wait for the app to render, scroll to
// the bottom and back to trigger lazy content, then read the page's rendered text.
// Job posts (spec 3.4) and selections go through the visibility filter instead, since job posts
// are where hidden "if you are an AI" text shows up.

export const PAGE_TEXT_LIMIT = 100_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Visible text inside the user's selection, skipping hidden nodes. */
export function selectionVisibleText(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  const checker = createVisibilityChecker();
  const parts: string[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i);
    const root = range.commonAncestorContainer;
    const visit = (node: Text) => {
      if (
        !range.intersectsNode(node) ||
        !node.parentElement ||
        !checker.isVisible(node.parentElement)
      )
        return;
      let t = node.nodeValue ?? '';
      if (node === range.endContainer) t = t.slice(0, range.endOffset);
      if (node === range.startContainer) t = t.slice(range.startOffset);
      parts.push(t);
    };
    if (root.nodeType === Node.TEXT_NODE) visit(root as Text);
    else walkTextNodes(root, visit);
  }
  return parts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Visible text of the whole page, not just the viewport. */
export function visiblePageText(limit = PAGE_TEXT_LIMIT): string {
  const everything = { x: -1e6, y: -1e6, w: 2e6, h: 1e8 };
  return extractVisibleText(everything, createVisibilityChecker(), { cap: limit }).text;
}

export async function readPageText(
  scope: 'selection' | 'page' | 'job',
): Promise<{ title: string; text: string; url: string }> {
  const base = { title: document.title, url: location.href };
  if (scope === 'selection')
    return { ...base, text: selectionVisibleText().slice(0, PAGE_TEXT_LIMIT) };
  if (scope === 'job') return { ...base, text: visiblePageText() };
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
