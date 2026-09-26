import { z } from 'zod';
import { earlierAnswersBlock, neutralize } from '@/kb/contextBuilder';
import { matchOption, normalizeLabel, rankMatches, STRONG_MATCH } from '@/kb/similarity';
import { earlierOnSite, type LibraryEntry } from '@/kb/library';
import type { FieldInfo, PageInfo, Settings } from '@/storage/schema';
import { parseLimits, type Limits } from './limits';
import { renderBatchRules } from './prompts';
import { ANSWER_TYPES, cleanAnswer, type AnswerType } from './tagParser';
import type { LlmProvider, Usage } from './types';

// "Fill form": draft answers for every field of a form in one request (or a few for long forms),
// with the same rules as single answers.

/** Fields per request: large enough to be one request for most forms, small enough to stay fast. */
export const FIELDS_PER_REQUEST = 20;
const TOKENS_PER_FIELD = 350;

export interface FormFieldDraft {
  field: FieldInfo;
  question: string;
  limits: Limits;
  answer: string;
  type: AnswerType;
  missing: string[];
  notes: string;
  source: 'model' | 'library' | 'none';
  /** Library entry the answer came from, when reused. */
  libraryId?: string;
}

export const BatchSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      type: z.enum(ANSWER_TYPES),
      answer: z.string(),
      missing: z.array(z.string()),
      notes: z.string(),
    }),
  ),
});

/**
 * Backstop for skills-test items (spec 2.2): obvious code or quiz questions get no answer even
 * if the model drafts one. Live test: Flash-Lite answered "What does this print?" in batch mode.
 */
const ASSESSMENT_PATTERNS = [
  /\bwhat (?:does|will) (?:this|the following)(?: code| snippet| program| query)? (?:print|output|return|log)\b/i,
  /\bwhat is the (?:output|result|return value) of\b/i,
  /\b(?:time|space) complexity\b/i,
  /\bprint\s*\(|console\.log\s*\(|System\.out\.print|\bdef \w+\(|=>\s*\{|#include\s*</,
];

export function looksLikeAssessment(question: string): boolean {
  return ASSESSMENT_PATTERNS.some((re) => re.test(question));
}

const GAP_ADMISSION = new RegExp(
  [
    "\\bI (?:have not|haven't|havent)(?: yet)?(?: \\w+ly)? (?:worked|used|had|built|done|written|touched|been exposed)\\b",
    "\\bI (?:do not|don't) have (?:any |much |direct |hands-on |professional )?(?:experience|exposure)\\b",
    "\\bI(?: am|'m) not (?:familiar|experienced)\\b",
    '\\bI (?:lack|have (?:limited|no) )',
    '\\b(?:no|limited) (?:direct |hands-on |professional )?experience\\b',
  ].join('|'),
  'i',
);

/** Saved answers written in "stick to my profile" mode that admit a gap ("I haven't worked with X"). */
export function admitsGap(answer: string): boolean {
  return GAP_ADMISSION.test(answer);
}

/** Snap a single-choice answer to the exact option label, so review and insert agree. */
export function snapToOption(field: FieldInfo, answer: string): string {
  if (!['select', 'radio-group'].includes(field.kind) || !field.options?.length || !answer.trim())
    return answer;
  const i = matchOption(field.options, answer);
  return i === -1 ? answer : field.options[i]!;
}

export function questionFor(field: FieldInfo): string {
  return [field.label, field.label ? '' : field.placeholder, field.hint]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function attr(v: string): string {
  return v.replace(/["<>]/g, '');
}

export function batchUserText(opts: {
  fields: { field: FieldInfo; question: string; limits: Limits }[];
  page: PageInfo;
  settings: Settings;
  today: string;
  jobContext?: string | null;
  earlierAnswers?: { question: string; answer: string }[];
}): string {
  const { page, settings } = opts;
  const meta = [
    page.title && `title: ${neutralize(page.title)}`,
    `site: ${page.hostname}`,
    page.lang && `page language: ${page.lang}`,
  ].filter(Boolean);
  const fields = opts.fields.map(({ field: f, question, limits }) => {
    const kind = f.inputType && f.inputType !== 'text' ? `${f.kind} (${f.inputType})` : f.kind;
    const parts = [
      `<field id="${attr(f.targetId)}" kind="${attr(kind)}" max_chars="${limits.maxChars}"${limits.maxWords ? ` max_words="${limits.maxWords}"` : ''}${f.required ? ' required="yes"' : ''}>`,
      `<question>${neutralize(question)}</question>`,
      f.placeholder && f.label ? `<placeholder>${neutralize(f.placeholder)}</placeholder>` : '',
      f.options?.length ? `<options>${f.options.map(neutralize).join(' | ')}</options>` : '',
      f.currentValue
        ? `<current_value>${neutralize(f.currentValue.slice(0, 500))}</current_value>`
        : '',
      '</field>',
    ];
    return parts.filter(Boolean).join('\n');
  });
  const language =
    settings.answerLanguage === 'auto' ? 'same as each question' : settings.answerLanguage;
  return [
    `<page_meta>${meta.join('; ')}</page_meta>`,
    opts.jobContext?.trim()
      ? `<job_context>\n${neutralize(opts.jobContext.trim())}\n</job_context>`
      : '',
    opts.earlierAnswers?.length ? earlierAnswersBlock(opts.earlierAnswers) : '',
    `<fields>\n${fields.join('\n')}\n</fields>`,
    `<options>today: ${opts.today}; tone: ${settings.tone}; length: short fields get the value or one or two sentences, text boxes about 120 words at most and always under max_chars, except cover letter fields, which get a full cover letter of about 300 words with a greeting and sign-off; language: ${language}</options>`,
    'Write an answer for every field.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Saved answers that closely match a field's question are reused without asking the model.
 * Essays only from the same site: "why I want to join Acme" must not land in Globex's form.
 */
export function libraryMatch(
  question: string,
  library: LibraryEntry[],
  hostname: string,
  fillGaps = false,
): LibraryEntry | null {
  const usable = library.filter(
    (e) =>
      (e.hostname === hostname || !['long_text', 'unclear'].includes(e.questionType)) &&
      !(fillGaps && admitsGap(e.answer)),
  );
  const [best] = rankMatches(question, usable, STRONG_MATCH);
  return best?.entry ?? null;
}

export function schemaJson(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(BatchSchema) as Record<string, unknown>;
  return schema;
}

export async function draftForm(opts: {
  provider: LlmProvider;
  settings: Settings;
  model: string;
  candidateBlock: string;
  page: PageInfo;
  fields: FieldInfo[];
  library: LibraryEntry[];
  today: string;
  jobContext?: string | null;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ drafts: FormFieldDraft[]; usage: Usage[] }> {
  const prepared = opts.fields.map((field) => {
    const question = questionFor(field);
    return { field, question, limits: parseLimits(question, field) };
  });
  const drafts = new Map<string, FormFieldDraft>();
  const toModel: typeof prepared = [];

  for (const p of prepared) {
    const saved = libraryMatch(
      p.question,
      opts.library,
      opts.page.hostname,
      opts.settings.fillGaps,
    );
    if (saved) {
      drafts.set(p.field.targetId, {
        ...p,
        answer: saved.answer,
        type: saved.questionType as AnswerType,
        missing: [],
        notes: '',
        source: 'library',
        libraryId: saved.id,
      });
    } else toModel.push(p);
  }

  // Earlier pages of this application, minus questions that are fields of this very form (those
  // are being answered now, some just reused from the library).
  const thisForm = new Set(prepared.map((p) => normalizeLabel(p.question)));
  const earlierAnswers = earlierOnSite(opts.library, opts.page.hostname)
    .filter((e) => !thisForm.has(normalizeLabel(e.question)))
    .map((e) => ({ question: e.question, answer: e.answer }));
  const usage: Usage[] = [];
  const system = [
    { text: renderBatchRules(opts.settings.styleRules, opts.settings.fillGaps) },
    { text: opts.candidateBlock, cache: true },
  ];
  for (let i = 0; i < toModel.length; i += FIELDS_PER_REQUEST) {
    const chunk = toModel.slice(i, i + FIELDS_PER_REQUEST);
    opts.onProgress?.(i, toModel.length);
    const result = await opts.provider.complete(
      {
        model: opts.model,
        maxTokens: Math.min(16_000, 1024 + chunk.length * TOKENS_PER_FIELD),
        system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: batchUserText({
                  fields: chunk,
                  page: opts.page,
                  settings: opts.settings,
                  today: opts.today,
                  jobContext: opts.jobContext,
                  earlierAnswers,
                }),
              },
            ],
          },
        ],
        jsonSchema: schemaJson(),
        schemaName: 'save_answers',
      },
      opts.signal,
    );
    usage.push(result.usage);
    const parsed = BatchSchema.safeParse(result.json);
    const byId = new Map(parsed.success ? parsed.data.answers.map((a) => [a.id, a]) : []);
    for (const p of chunk) {
      const found = byId.get(p.field.targetId);
      const a =
        found && looksLikeAssessment(p.question)
          ? { ...found, type: 'assessment' as const, answer: '' }
          : found;
      drafts.set(
        p.field.targetId,
        a
          ? {
              ...p,
              question: a.question || p.question,
              type: a.type,
              answer: a.type === 'assessment' ? '' : snapToOption(p.field, cleanAnswer(a.answer)),
              missing: a.missing.filter((m) => m.trim()),
              notes: a.notes.trim(),
              source: 'model',
            }
          : {
              ...p,
              answer: '',
              type: 'unclear',
              missing: [],
              notes: 'No answer came back for this field.',
              source: 'none',
            },
      );
    }
  }
  opts.onProgress?.(toModel.length, toModel.length);
  return { drafts: prepared.map((p) => drafts.get(p.field.targetId)!), usage };
}

/** Which drafts start ticked for insertion. */
export function shouldInsertByDefault(d: FormFieldDraft): boolean {
  if (!d.answer.trim() || d.type === 'assessment') return false;
  if (/\[\[[^\]]*\]\]/.test(d.answer)) return false;
  if (d.field.currentValue?.trim()) return false;
  return d.answer.length <= d.limits.maxChars;
}
