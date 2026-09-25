import { ratio } from '@/kb/similarity';
import { choiceLabel } from './fields';
import { createVisibilityChecker } from './hiddenText';
import type { InsertResult } from './insert';
import { collapse } from './visibleText';

// Native choice fields (spec 12): selects, radio groups, and checkbox groups. Custom dropdowns
// (React-Select, Workday widgets) only show the chosen option in the panel; no auto-clicking.

export const FUZZY_MIN = 0.8;

export function normalizeLabel(text: string): string {
  return collapse(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

/** Index of the option matching `wanted`: exact on normalized text, else fuzzy >= 0.8. */
export function matchOption(options: string[], wanted: string): number {
  const w = normalizeLabel(wanted);
  const exact = options.findIndex((o) => normalizeLabel(o) === w);
  if (exact !== -1) return exact;
  let best = -1;
  let bestScore = FUZZY_MIN;
  options.forEach((o, i) => {
    const score = ratio(normalizeLabel(o), w);
    if (score >= bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function groupMembers(input: HTMLInputElement): HTMLInputElement[] {
  const root = input.form ?? input.ownerDocument;
  if (input.name) {
    return Array.from(
      root.querySelectorAll<HTMLInputElement>(`input[type="${input.type}"]`),
    ).filter((i) => i.name === input.name);
  }
  const container = input.closest('fieldset, [role="radiogroup"], [role="group"]');
  return container
    ? Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${input.type}"]`))
    : [input];
}

function fire(el: Element) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function applyChoice(el: Element | null, labels: string[]): InsertResult {
  if (!el || !el.isConnected) return { ok: false, reason: 'TARGET_GONE' };
  const wanted = labels.map((l) => l.trim()).filter(Boolean);
  if (!wanted.length) return { ok: false, reason: 'NO_MATCH' };

  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options, (o) => o.text);
    const picks = wanted.map((w) => matchOption(options, w)).filter((i) => i !== -1);
    if (!picks.length) return { ok: false, reason: 'NO_MATCH' };
    el.focus();
    if (el.multiple) Array.from(el.options).forEach((o, i) => (o.selected = picks.includes(i)));
    else el.selectedIndex = picks[0]!;
    fire(el);
    el.blur();
    return el.selectedIndex === picks[0]
      ? { ok: true, method: 'choice' }
      : { ok: false, reason: 'VERIFY_FAILED' };
  }

  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    const checker = createVisibilityChecker();
    const members = groupMembers(el);
    const options = members.map((m) => choiceLabel(m, checker));
    const picks = new Set(wanted.map((w) => matchOption(options, w)).filter((i) => i !== -1));
    if (!picks.size) return { ok: false, reason: 'NO_MATCH' };
    if (el.type === 'radio') {
      const target = members[[...picks][0]!]!;
      if (!target.checked) target.click();
      return target.checked
        ? { ok: true, method: 'choice' }
        : { ok: false, reason: 'VERIFY_FAILED' };
    }
    members.forEach((m, i) => {
      if (m.checked !== picks.has(i)) m.click();
    });
    return members.every((m, i) => m.checked === picks.has(i))
      ? { ok: true, method: 'choice' }
      : { ok: false, reason: 'VERIFY_FAILED' };
  }
  return { ok: false, reason: 'NOT_FILLABLE' };
}
