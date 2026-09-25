import { computed, ref, shallowRef } from 'vue';
import { buildSystemBlocks, buildUserTurn, hasCandidateData, todayIso } from '@/kb/contextBuilder';
import { LlmError, type LlmErrorKind } from '@/llm/errors';
import { countWords, parseLimits, type Limits } from '@/llm/limits';
import { createProvider } from '@/llm/provider';
import { TagParser, type ParsedAnswer } from '@/llm/tagParser';
import { EMPTY_USAGE, type AnswerRequest, type ContentPart, type Usage } from '@/llm/types';
import { getApiKey, getSettings, getSources } from '@/storage/items';
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
      return settings?.provider === 'gemini'
        ? "You've hit Gemini's rate limit. Wait a minute and try again."
        : 'Rate limited by the API. Wait a minute and try again.';
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
  let controller: AbortController | null = null;
  let lastCapture: PendingCapture | null = null;

  const chars = computed(() => answer.value.length);
  const words = computed(() => countWords(answer.value));
  const overLimit = computed(() => {
    const l = limits.value;
    if (!l) return false;
    return chars.value > l.maxChars || (l.maxWords !== undefined && words.value > l.maxWords);
  });

  function reset() {
    controller?.abort();
    answer.value = '';
    parsed.value = null;
    usage.value = EMPTY_USAGE;
    error.value = null;
    retryNote.value = '';
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
    const data = { sources: await getSources() };
    if (!hasCandidateData(data)) {
      phase.value = 'needs-profile';
      return;
    }

    const lim = parseLimits(capture.pageText, capture.field);
    limits.value = lim;
    const system = buildSystemBlocks(s, data);
    let content: ContentPart[] = buildUserTurn({
      capture,
      settings: s,
      limits: lim,
      today: todayIso(),
    });
    const provider = createProvider(s.provider, key, s.baseUrl);
    controller = new AbortController();
    const signal = controller.signal;
    phase.value = 'drafting';

    let shrunk = false;
    for (;;) {
      const parser = new TagParser();
      const req: AnswerRequest = {
        model: s.model,
        maxTokens: s.maxOutputTokens,
        system,
        messages: [{ role: 'user', content }],
      };
      try {
        await provider.stream(req, signal, (e) => {
          if (e.kind === 'text') {
            parser.push(e.delta);
            retryNote.value = '';
            phase.value = 'streaming';
            answer.value = parser.answerSoFar;
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
        });
        const result = parser.finish();
        parsed.value = result;
        answer.value = result.answer;
        retryNote.value = '';
        phase.value = result.type === 'assessment' ? 'assessment' : 'done';
        return;
      } catch (err) {
        retryNote.value = '';
        if (err instanceof LlmError && err.kind === 'aborted') {
          phase.value = 'stopped';
          return;
        }
        // Image too large: resize silently to 1092 px and retry once (spec 15).
        if (err instanceof LlmError && err.kind === 'image_too_large' && !shrunk && capture.image) {
          shrunk = true;
          const img = await shrinkImage(capture.image.dataUrl, 1092);
          content = content.map((p) => (p.type === 'image' ? { type: 'image', ...img } : p));
          continue;
        }
        const e = err instanceof LlmError ? err : new LlmError('bad_request', String(err));
        error.value = { kind: e.kind, message: errorMessage(e, s) };
        phase.value = 'error';
        return;
      }
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
    run,
    stop,
    retry,
    reset,
  };
}
