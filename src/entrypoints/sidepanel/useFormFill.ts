import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { loadCandidateData } from '@/kb/candidate';
import { buildSystemBlocks, hasCandidateData, todayIso } from '@/kb/contextBuilder';
import { getJobContext, jobPromptText } from '@/kb/jobContext';
import { getLibrary, upsertEntry } from '@/kb/library';
import { LlmError } from '@/llm/errors';
import { draftForm, shouldInsertByDefault, type FormFieldDraft } from '@/llm/formFill';
import { createAppProvider } from '@/llm/provider';
import type { Message, MessageType, Reply } from '@/messaging/protocol';
import { sendToBackground, sendToTab } from '@/messaging/send';
import { getApiKey, getSettings, pendingFormItem } from '@/storage/items';
import type { FieldInfo, PageInfo } from '@/storage/schema';
import { errorMessage } from './useAnswer';

export interface ReviewItem extends FormFieldDraft {
  insert: boolean;
  result?: 'inserted' | 'failed';
  resultNote?: string;
}

const CHOICE_KINDS: FieldInfo['kind'][] = ['select', 'radio-group', 'checkbox-group'];
const GESTURE_HINT =
  'Right-click the page and choose "Fill this form with AnswerSnap", or press Alt+Shift+Q there first.';

/** "Fill form": scan every field, draft all answers in one request, review, insert (never submit). */
export function useFormFill() {
  const phase = ref<'idle' | 'scanning' | 'scanned' | 'drafting' | 'review' | 'inserting' | 'done'>(
    'idle',
  );
  const tabId = ref<number | null>(null);
  const page = shallowRef<PageInfo | null>(null);
  const fields = shallowRef<FieldInfo[]>([]);
  /** Fields to draft; filled-in fields start unticked. */
  const toDraft = ref<Set<string>>(new Set());
  const items = ref<ReviewItem[]>([]);
  const progress = ref('');
  const error = ref('');
  const model = ref('');
  let controller: AbortController | null = null;

  const selectedCount = computed(() => items.value.filter((i) => i.insert).length);
  const summary = computed(() => {
    const done = items.value.filter((i) => i.result === 'inserted').length;
    const failed = items.value.filter((i) => i.result === 'failed').length;
    return { done, failed };
  });

  function setScan(id: number, p: PageInfo, found: FieldInfo[]) {
    tabId.value = id;
    page.value = p;
    fields.value = found;
    toDraft.value = new Set(found.filter((f) => !f.currentValue?.trim()).map((f) => f.targetId));
    items.value = [];
    error.value = found.length ? '' : 'No fillable fields found on this page.';
    phase.value = found.length ? 'scanned' : 'idle';
  }

  async function toPage<T extends MessageType>(msg: Message<T>): Promise<Reply<T>> {
    if (tabId.value === null) throw new Error('no tab');
    try {
      return await sendToTab<T>(tabId.value, msg);
    } catch {
      const ready = await sendToBackground<'ENSURE_CAPTURE'>({
        type: 'ENSURE_CAPTURE',
        tabId: tabId.value,
      });
      if (!ready.ok) throw new Error(GESTURE_HINT);
      return sendToTab<T>(tabId.value, msg);
    }
  }

  async function scan() {
    error.value = '';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    tabId.value = tab.id;
    phase.value = 'scanning';
    try {
      const result = await toPage<'SCAN_FORM'>({ type: 'SCAN_FORM' });
      setScan(tab.id, result.page, result.fields);
    } catch (err) {
      phase.value = 'idle';
      error.value =
        err instanceof Error && err.message === GESTURE_HINT
          ? GESTURE_HINT
          : "Couldn't read the fields on this page.";
    }
  }

  async function takePending() {
    const pending = await pendingFormItem.getValue();
    if (!pending) return;
    await pendingFormItem.removeValue();
    setScan(pending.tabId, pending.page, pending.fields);
  }
  const unwatch = pendingFormItem.watch((v) => {
    if (v) void takePending();
  });
  void takePending();
  onUnmounted(() => {
    unwatch();
    controller?.abort();
  });

  async function draft() {
    if (!page.value) return;
    error.value = '';
    const settings = await getSettings();
    const key = await getApiKey(settings.provider);
    if (!key) return void (error.value = 'Add your API key to start.');
    const data = await loadCandidateData();
    if (!hasCandidateData(data))
      return void (error.value = 'Add your resume so answers have something to draw from.');
    const chosen = fields.value.filter((f) => toDraft.value.has(f.targetId));
    if (!chosen.length) return void (error.value = 'Tick at least one field to draft.');

    phase.value = 'drafting';
    progress.value = `Drafting ${chosen.length} ${chosen.length === 1 ? 'answer' : 'answers'}`;
    controller = new AbortController();
    model.value = settings.model;
    const provider = createAppProvider(settings, key, (e) => (model.value = e.to));
    try {
      const { drafts } = await draftForm({
        provider,
        settings,
        model: settings.model,
        candidateBlock: buildSystemBlocks(settings, data)[1]!.text,
        page: page.value,
        fields: chosen,
        library: await getLibrary(),
        today: todayIso(),
        jobContext: jobPromptText(await getJobContext(page.value.hostname)),
        signal: controller.signal,
        onProgress: (done, total) => {
          if (total > 0 && done < total)
            progress.value = `Drafting answers ${done + 1} to ${Math.min(total, done + 20)} of ${total}`;
        },
      });
      items.value = drafts.map((d) => ({ ...d, insert: shouldInsertByDefault(d) }));
      phase.value = 'review';
    } catch (err) {
      phase.value = 'scanned';
      if (controller.signal.aborted) return;
      error.value =
        err instanceof LlmError
          ? errorMessage(err, settings)
          : "Couldn't draft the answers. Try again.";
    } finally {
      progress.value = '';
    }
  }

  function stop() {
    controller?.abort();
  }

  /** Insert the ticked answers one by one. Never clicks Submit or Next. */
  async function insertSelected() {
    const settings = await getSettings();
    phase.value = 'inserting';
    for (const item of items.value) {
      if (!item.insert || item.result === 'inserted') continue;
      const f = item.field;
      try {
        const result = CHOICE_KINDS.includes(f.kind)
          ? await toPage<'APPLY_CHOICE'>({
              type: 'APPLY_CHOICE',
              targetId: f.targetId,
              labels:
                f.kind === 'checkbox-group' ? item.answer.split(/\s*[,\n]\s*/) : [item.answer],
            })
          : await toPage<'INSERT_ANSWER'>({
              type: 'INSERT_ANSWER',
              targetId: f.targetId,
              text: item.answer,
              mode: 'replace',
            });
        if (result.ok) {
          item.result = 'inserted';
          item.resultNote = undefined;
          if (settings.history.enabled && page.value) {
            await upsertEntry({
              hostname: page.value.hostname,
              pageTitle: page.value.title,
              question: item.question,
              questionType: item.type,
              answer: item.answer,
              model: item.source === 'library' ? 'saved answer' : model.value,
            });
          }
        } else {
          item.result = 'failed';
          item.resultNote =
            result.reason === 'NO_MATCH'
              ? 'None of the options matched.'
              : result.reason === 'TARGET_GONE'
                ? 'The field is gone. Scan the form again.'
                : "Couldn't fill it directly. Copy the answer and paste it.";
        }
      } catch (err) {
        item.result = 'failed';
        item.resultNote =
          err instanceof Error && err.message === GESTURE_HINT
            ? GESTURE_HINT
            : "Couldn't reach the page.";
      }
    }
    phase.value = 'done';
  }

  function highlight(targetId: string, on: boolean) {
    void toPage<'HIGHLIGHT_FIELD'>({ type: 'HIGHLIGHT_FIELD', targetId, on }).catch(
      () => undefined,
    );
  }

  function reset() {
    controller?.abort();
    phase.value = 'idle';
    fields.value = [];
    items.value = [];
    error.value = '';
  }

  return {
    phase,
    page,
    fields,
    toDraft,
    items,
    progress,
    error,
    model,
    selectedCount,
    summary,
    scan,
    draft,
    stop,
    insertSelected,
    highlight,
    reset,
  };
}
