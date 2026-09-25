import { computed, ref, shallowRef } from 'vue';
import { buildSystemBlocks, buildUserTurn, hasCandidateData, todayIso } from '@/kb/contextBuilder';
import { getJobContext, jobPromptText } from '@/kb/jobContext';
import { refineInstruction, refineMessages, type RefineAction } from '@/llm/conversation';
import { LlmError, type LlmErrorKind } from '@/llm/errors';
import { countWords, parseLimits, type Limits } from '@/llm/limits';
import { createProvider } from '@/llm/provider';
import { TagParser, type ParsedAnswer } from '@/llm/tagParser';
import {
  EMPTY_USAGE,
  type ChatMessage,
  type ContentPart,
  type LlmProvider,
  type SystemBlock,
  type Usage,
} from '@/llm/types';
import { loadCandidateData } from '@/kb/candidate';
import { getApiKey, getSettings } from '@/storage/items';
import type { PendingCapture, Settings } from '@/storage/schema';

export type AnswerPhase =
  | 'idle'
  | 'needs-key'
  | 'needs-profile'
  | 'drafting'
  | 'streaming'
  | 'done'
  | 'stopped'
  | 'assessment'
  | 'error';

export interface AnswerError {
  kind: LlmErrorKind;
  message: string;
}

/** Downscale a data URL image so its long edge is at most `maxEdge` (400 image-size retry). */
async function shrinkImage(
  dataUrl: string,
  maxEdge: number,
): Promise<{ data: string; mediaType: 'image/png' | 'image/jpeg' }> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { data: btoa(binary), mediaType: 'image/jpeg' };
}

export function errorMessage(err: LlmError, settings: Settings | null): string {
  switch (err.kind) {
    case 'auth':
      return 'The API key was rejected. Check it in Settings.';
    case 'rate_limit':
      if (settings?.provider === 'gemini' && /free_tier/i.test(err.message)) {
        // Free-tier quotas are per model and per minute or per day (about 20 a day on 3.8 Flash).
        return "You've reached Gemini's free-tier limit for this model. Wait a bit, switch to another Gemini model in Settings, or use a paid key.";
      }
      return 'Rate limited by the API. Wait a minute and try again.';
    case 'overloaded':
    case 'server':
      return 'The AI service is busy. Try again in a moment.';
    case 'network':
      return "Can't reach the AI service. Check your connection.";
    case 'no_key':
      return 'Add your API key to start.';
    default:
      return err.message;
  }
}

export function useAnswer() {
  const phase = ref<AnswerPhase>('idle');
  const answer = ref('');
  const parsed = shallowRef<ParsedAnswer | null>(null);
  const usage = shallowRef<Usage>(EMPTY_USAGE);
  const error = shallowRef<AnswerError | null>(null);
  const retryNote = ref('');
  const limits = shallowRef<Limits | null>(null);
  const settings = shallowRef<Settings | null>(null);
  const model = ref('');
  /** Answer text as the model last produced it, to tell whether the user edited it. */
  const generated = ref('');
  let controller: AbortController | null = null;
  let lastCapture: PendingCapture | null = null;

  // The conversation so far. System blocks stay byte-identical across refinements.
  let convo: {
    provider: LlmProvider;
    system: SystemBlock[];
    history: ChatMessage[];
    lastRaw: string;
  } | null = null;

  const chars = computed(() => answer.value.length);
  const words = computed(() => countWords(answer.value));
  const overLimit = computed(() => {
    const l = limits.value;
    if (!l) return false;
    return chars.value > l.maxChars || (l.maxWords !== undefined && words.value > l.maxWords);
  });
  const edited = computed(() => answer.value !== generated.value);

  function reset() {
    controller?.abort();
    answer.value = '';
    generated.value = '';
    parsed.value = null;
    usage.value = EMPTY_USAGE;
    error.value = null;
    retryNote.value = '';
    convo = null;
  }

  /** Stream one assistant turn for `messages`. Returns the raw output, or null on failure. */
  async function streamTurn(
    messages: ChatMessage[],
    image?: PendingCapture['image'],
  ): Promise<string | null> {
    if (!convo || !settings.value) return null;
    const s = settings.value;
    controller = new AbortController();
    const signal = controller.signal;
    const before = answer.value;
    phase.value = 'drafting';
    error.value = null;
    let shrunk = false;
    for (;;) {
      const parser = new TagParser();
      try {
        await convo.provider.stream(
          { model: s.model, maxTokens: s.maxOutputTokens, system: convo.system, messages },
          signal,
          (e) => {
            if (e.kind === 'text') {
              parser.push(e.delta);
              retryNote.value = '';
              const soFar = parser.answerSoFar;
              if (soFar) {
                phase.value = 'streaming';
                answer.value = soFar;
              }
            } else if (e.kind === 'usage') {
              usage.value = e.usage;
            } else if (e.kind === 'retry') {
              retryNote.value =
                e.reason === 'rate_limit'
                  ? `Rate limited by the API. Retrying in ${Math.ceil(e.waitMs / 1000)} seconds.`
                  : e.reason === 'overloaded'
                    ? 'The AI service is busy. Retrying.'
                    : "Can't reach the AI service. Retrying.";
            }
          },
        );
        const result = parser.finish();
        parsed.value = result;
        answer.value = result.answer;
        generated.value = result.answer;
        retryNote.value = '';
        phase.value = result.type === 'assessment' ? 'assessment' : 'done';
        return parser.text;
      } catch (err) {
        retryNote.value = '';
        if (err instanceof LlmError && err.kind === 'aborted') {
          phase.value = 'stopped';
          return null;
        }
        // Image too large: resize silently to 1092 px and retry once (spec 15).
        if (err instanceof LlmError && err.kind === 'image_too_large' && !shrunk && image) {
          shrunk = true;
          const img = await shrinkImage(image.dataUrl, 1092);
          messages = messages.map((m, i) =>
            i === 0
              ? {
                  ...m,
                  content: m.content.map((p) =>
                    p.type === 'image' ? { type: 'image' as const, ...img } : p,
                  ),
                }
              : m,
          );
          convo.history = convo.history.length
            ? [messages[0]!, ...convo.history.slice(1)]
            : convo.history;
          continue;
        }
        const e = err instanceof LlmError ? err : new LlmError('bad_request', String(err));
        error.value = { kind: e.kind, message: errorMessage(e, s) };
        phase.value = 'error';
        if (before) answer.value = before;
        return null;
      }
    }
  }

  async function run(capture: PendingCapture) {
    reset();
    lastCapture = capture;
    const s = await getSettings();
    settings.value = s;
    model.value = s.model;
    const key = await getApiKey(s.provider);
    if (!key) {
      phase.value = 'needs-key';
      return;
    }
    const data = await loadCandidateData();
    if (!hasCandidateData(data)) {
      phase.value = 'needs-profile';
      return;
    }

    const lim = parseLimits(capture.pageText, capture.field);
    limits.value = lim;
    const job = await getJobContext(capture.page.hostname);
    const content: ContentPart[] = buildUserTurn({
      capture,
      settings: s,
      limits: lim,
      today: todayIso(),
      jobContext: jobPromptText(job),
    });
    const first: ChatMessage = { role: 'user', content };
    convo = {
      provider: createProvider(s.provider, key, s.baseUrl),
      system: buildSystemBlocks(s, data),
      history: [first],
      lastRaw: '',
    };
    const raw = await streamTurn([first], capture.image);
    if (raw !== null && convo) convo.lastRaw = raw;
  }

  /** Follow-up turn (spec 3.5). Hand edits are swapped into the previous answer first. */
  async function refine(action: RefineAction) {
    if (!convo || !limits.value || !convo.lastRaw) return;
    const instruction = refineInstruction(action, answer.value.length, limits.value);
    const messages = refineMessages(convo.history, convo.lastRaw, answer.value, instruction);
    const raw = await streamTurn(messages);
    if (raw !== null && convo) {
      convo.history = messages;
      convo.lastRaw = raw;
    }
  }

  function stop() {
    controller?.abort();
  }

  async function retry() {
    if (lastCapture) await run(lastCapture);
  }

  return {
    phase,
    answer,
    parsed,
    usage,
    error,
    retryNote,
    limits,
    settings,
    model,
    chars,
    words,
    overLimit,
    edited,
    run,
    refine,
    stop,
    retry,
    reset,
  };
}
