// Incremental parser for the tagged answer format (spec 11.4, 11.5):
// <question>…</question><type>…</type><answer>…</answer><missing>…</missing><notes>…</notes>

export const ANSWER_TYPES = [
  'short_text',
  'long_text',
  'number',
  'yes_no',
  'single_choice',
  'multi_choice',
  'url',
  'date',
  'salary',
  'assessment',
  'unclear',
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

const TAGS = ['question', 'type', 'answer', 'missing', 'notes'] as const;
type Tag = (typeof TAGS)[number];

export interface ParsedAnswer {
  question: string;
  type: AnswerType;
  answer: string;
  missing: string[];
  notes: string;
  /** True when no <answer> tag appeared and the whole output was used. */
  usedFallback: boolean;
}

function between(raw: string, tag: Tag): string | null {
  const open = raw.indexOf(`<${tag}>`);
  if (open === -1) return null;
  const start = open + tag.length + 2;
  const close = raw.indexOf(`</${tag}>`, start);
  return raw.slice(start, close === -1 ? undefined : close);
}

/** Drop a trailing fragment that could be the start of a closing tag, e.g. "</ans". */
function trimPartialTag(text: string): string {
  const lt = text.lastIndexOf('<');
  if (lt === -1) return text;
  const tail = text.slice(lt);
  return '</answer>'.startsWith(tail) ? text.slice(0, lt) : text;
}

export class TagParser {
  private raw = '';

  push(delta: string): void {
    this.raw += delta;
  }

  get text(): string {
    return this.raw;
  }

  /** Answer text streamed so far, for live display. Empty until <answer> opens. */
  get answerSoFar(): string {
    const open = this.raw.indexOf('<answer>');
    if (open === -1) return '';
    const start = open + '<answer>'.length;
    const close = this.raw.indexOf('</answer>', start);
    const body =
      close === -1 ? trimPartialTag(this.raw.slice(start)) : this.raw.slice(start, close);
    return body.replace(/^\s+/, '');
  }

  finish(): ParsedAnswer {
    return parseTagged(this.raw);
  }
}

export function parseTagged(raw: string): ParsedAnswer {
  const answerTag = between(raw, 'answer');
  const typeText = (between(raw, 'type') ?? '').trim().toLowerCase();
  const type = (ANSWER_TYPES as readonly string[]).includes(typeText)
    ? (typeText as AnswerType)
    : 'unclear';
  let answer: string;
  let usedFallback = false;
  if (answerTag !== null) {
    answer = answerTag;
  } else {
    usedFallback = true;
    console.warn('[AnswerSnap] model output had no <answer> tag; using the whole output');
    answer = raw;
    for (const tag of TAGS)
      answer = answer.replace(new RegExp(`<${tag}>[\\s\\S]*?(</${tag}>|$)`, 'g'), '');
  }
  const missing = (between(raw, 'missing') ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^(none|empty|n\/a)$/i.test(s));
  return {
    question: (between(raw, 'question') ?? '').trim(),
    type,
    answer: type === 'assessment' ? '' : cleanAnswer(answer),
    missing,
    notes: (between(raw, 'notes') ?? '').trim(),
    usedFallback,
  };
}

/**
 * Safety net after the stream (spec 11.5): trim, strip wrapping quotes, remove markdown
 * emphasis, and replace dashes used as pauses. The style rules should already prevent these.
 */
export function cleanAnswer(text: string): string {
  let t = text.trim();
  if (/^["“'].*["”']$/s.test(t) && t.length > 1) t = t.slice(1, -1).trim();
  t = t
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?]|$)/gm, '$1$2')
    .replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s).,;:!?]|$)/gm, '$1$2');
  // Ranges like 2019–2021 keep a plain hyphen.
  t = t.replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2');
  // A dash used as a pause becomes a comma.
  t = t.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',');
  return t.trim();
}
