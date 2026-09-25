import { renderSystemRules } from '@/llm/prompts';
import type { ContentPart, SystemBlock } from '@/llm/types';
import type { KnowledgeSource, PendingCapture, Settings } from '@/storage/schema';
import { lengthGuide, type Limits } from '@/llm/limits';

// Context assembly (spec 10.6). Block order is what makes caching work:
//   system[0] rules (changes only with settings)
//   system[1] candidate data, with the cache breakpoint
//   user turn: image first, then page data and <options> (today's date lives here, never in system)

export const PAGE_TEXT_CAP = 4000;
export const JOB_CONTEXT_CAP = 6000;

export interface CandidateData {
  /** Structured profile (M3). */
  profile?: unknown;
  standardAnswers?: Record<string, unknown> | null;
  sources: KnowledgeSource[];
}

const OUR_TAGS =
  'page_meta|page_text|field_info|job_context|saved_answers|example|options|candidate_profile|standard_answers|source_documents|source|question|type|answer|missing|notes|fields|field|placeholder|current_value|answer_sentences';
const TAG_LIKE = new RegExp(`<(/?)(${OUR_TAGS})\\b`, 'gi');

/** Page content is untrusted: stop it from closing or opening our tags. */
export function neutralize(text: string): string {
  return text.replace(TAG_LIKE, '‹$1$2');
}

function attr(value: string): string {
  return value.replace(/["<>]/g, '');
}

function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(hasContent);
  return true;
}

export function candidateBlock(data: CandidateData): string {
  const parts: string[] = [];
  if (hasContent(data.profile)) {
    parts.push(
      `<candidate_profile>\n${JSON.stringify(data.profile, null, 1)}\n</candidate_profile>`,
    );
  }
  if (data.standardAnswers && hasContent(data.standardAnswers)) {
    parts.push(
      `<standard_answers>\n${JSON.stringify(data.standardAnswers, null, 1)}\n</standard_answers>`,
    );
  }
  const enabled = data.sources.filter((s) => s.enabled && s.text.trim());
  if (enabled.length) {
    const docs = enabled.map(
      (s) => `<source label="${attr(s.label)}">\n${s.text.trim()}\n</source>`,
    );
    parts.push(`<source_documents>\n${docs.join('\n')}\n</source_documents>`);
  }
  return parts.join('\n');
}

export function hasCandidateData(data: CandidateData): boolean {
  return candidateBlock(data).length > 0;
}

export function buildSystemBlocks(settings: Settings, data: CandidateData): SystemBlock[] {
  return [
    { text: renderSystemRules(settings.styleRules) },
    { text: candidateBlock(data), cache: true },
  ];
}

export interface UserTurnInput {
  capture: PendingCapture;
  settings: Settings;
  limits: Limits;
  today: string;
  jobContext?: string | null;
  savedAnswers?: { question: string; answer: string }[];
}

function fieldLine(f: PendingCapture['field']): string {
  if (!f) return '';
  const entries: [string, string | number | undefined][] = [
    ['kind', f.inputType && f.inputType !== 'text' ? `${f.kind} (${f.inputType})` : f.kind],
    ['max length', f.maxLength],
    ['placeholder', f.placeholder],
    ['label', f.label],
    ['hint', f.hint],
    ['options', f.options?.join(' | ')],
    ['current value', f.currentValue],
  ];
  return entries
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${neutralize(String(v))}`)
    .join('; ');
}

export function buildUserText(input: UserTurnInput): string {
  const { capture, settings, limits } = input;
  const blocks: string[] = [];
  const p = capture.page;
  const meta = [
    p.title && `title: ${neutralize(p.title)}`,
    `site: ${p.hostname}`,
    p.lang && `page language: ${p.lang}`,
  ].filter(Boolean);
  blocks.push(`<page_meta>${meta.join('; ')}</page_meta>`);
  const pageText = capture.pageText.slice(0, PAGE_TEXT_CAP).trim();
  if (pageText) blocks.push(`<page_text>\n${neutralize(pageText)}\n</page_text>`);
  const field = fieldLine(capture.field);
  if (field) blocks.push(`<field_info>${field}</field_info>`);
  const job = input.jobContext?.slice(0, JOB_CONTEXT_CAP).trim();
  if (job) blocks.push(`<job_context>\n${neutralize(job)}\n</job_context>`);
  if (input.savedAnswers?.length) {
    const examples = input.savedAnswers
      .slice(0, 3)
      .map((s) => `<example question="${attr(s.question)}">${neutralize(s.answer)}</example>`);
    blocks.push(`<saved_answers>\n${examples.join('\n')}\n</saved_answers>`);
  }
  const language =
    settings.answerLanguage === 'auto' ? 'same as the question' : settings.answerLanguage;
  const words = limits.maxWords ? `; word limit: ${limits.maxWords}` : '';
  blocks.push(
    `<options>today: ${input.today}; tone: ${settings.tone}; length: ${lengthGuide(settings.length, capture.field, limits)}; language: ${language}; hard character limit: ${limits.maxChars}${words}</options>`,
  );
  blocks.push('Write the answer.');
  return blocks.join('\n');
}

/** Image first, then text (spec 10.6). */
export function buildUserTurn(input: UserTurnInput): ContentPart[] {
  const parts: ContentPart[] = [];
  const img = input.capture.image;
  if (img && input.settings.sendScreenshot) {
    parts.push({
      type: 'image',
      mediaType: img.mediaType,
      data: img.dataUrl.replace(/^data:[^,]+,/, ''),
    });
  }
  parts.push({ type: 'text', text: buildUserText(input) });
  return parts;
}

export function todayIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
