import { computed, ref, shallowRef, watch, type ShallowRef } from 'vue';
import type { InsertMode } from '@/capture/insert';
import type { Message, MessageType, Reply } from '@/messaging/protocol';
import { sendToBackground, sendToTab } from '@/messaging/send';
import type { FieldInfo, PendingCapture } from '@/storage/schema';
import type { useAnswer } from './useAnswer';
import { t } from '@/ui/i18n';

const TEXT_KINDS: FieldInfo['kind'][] = ['input', 'textarea', 'contenteditable'];
const CHOICE_KINDS: FieldInfo['kind'][] = ['select', 'radio-group', 'checkbox-group'];
export const NO_MATCH = t(
  'insert_no_match',
  'None of the options matched the answer. Pick it on the page.',
);
const PASTE_KEY = /mac/i.test(navigator.platform) ? 'Cmd+V' : 'Ctrl+V';

export const COPY_FALLBACK = t(
  'insert_copy_fallback',
  "Couldn't fill this field directly. The answer is copied. Click the field and press $1.",
  PASTE_KEY,
);
export const COPY_BLOCKED = t(
  'insert_copy_blocked',
  "Couldn't fill this field directly. Select the answer text, copy it, and paste it into the field.",
);
export const TARGET_GONE = t(
  'insert_target_gone',
  'The page changed since the snip. Pick the field again, or copy the answer.',
);
export const NEEDS_GESTURE = t(
  'insert_needs_gesture',
  'Press Alt+Shift+Q or click the AnswerSnap icon on the page, then try again.',
);

class ScriptUnavailable extends Error {}

/** Insert, highlight, and field picking for the current capture (spec 12). */
export function useInsert(
  capture: ShallowRef<PendingCapture | null>,
  answer: ReturnType<typeof useAnswer>,
) {
  const target = shallowRef<FieldInfo | null>(null);
  const picking = ref(false);
  const busy = ref(false);
  const message = ref('');
  const toast = ref('');
  let toastTimer = 0;

  watch(
    () => capture.value?.id,
    () => {
      target.value = capture.value?.field ?? null;
      message.value = '';
    },
  );

  const isChoice = computed(() => !!target.value && CHOICE_KINDS.includes(target.value.kind));
  const hasExisting = computed(() => !isChoice.value && !!target.value?.currentValue?.trim());
  const answerReady = computed(() => answer.phase.value === 'done' && !!answer.answer.value.trim());
  const fillable = computed(
    () => !!target.value && (TEXT_KINDS.includes(target.value.kind) || isChoice.value),
  );
  /** Never truncate silently: over the limit, Insert waits for Fit limit or Cut (spec 12). */
  const canInsert = computed(
    () => answerReady.value && fillable.value && (isChoice.value || !answer.overLimit.value),
  );

  function flash(text: string) {
    toast.value = text;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.value = ''), 2000);
  }

  /** Message the page; if the script is gone (reload), ask the SW to inject it once more. */
  async function toPage<T extends MessageType>(msg: Message<T>): Promise<Reply<T>> {
    const tabId = capture.value?.tabId;
    if (tabId === undefined) throw new ScriptUnavailable();
    try {
      return await sendToTab<T>(tabId, msg);
    } catch {
      const ready = await sendToBackground<'ENSURE_CAPTURE'>({ type: 'ENSURE_CAPTURE', tabId });
      if (!ready.ok) throw new ScriptUnavailable();
      return sendToTab<T>(tabId, msg);
    }
  }

  /** The clipboard can refuse (panel not focused); say what to do either way. */
  async function writeClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(answer.answer.value);
      return true;
    } catch {
      return false;
    }
  }

  async function copyFallback(text: string) {
    message.value = (await writeClipboard()) ? text : COPY_BLOCKED;
  }

  async function insert(mode: InsertMode = 'replace') {
    const field = target.value;
    if (!field || !canInsert.value) return;
    message.value = '';
    if (field.inIframe) return copyFallback(COPY_FALLBACK);
    busy.value = true;
    if (isChoice.value) {
      try {
        // One option for single choice, a comma separated list for checkboxes (spec 11.4 rule 7).
        const labels =
          field.kind === 'checkbox-group'
            ? answer.answer.value.split(/\s*[,\n]\s*/)
            : [answer.answer.value];
        const result = await toPage<'APPLY_CHOICE'>({
          type: 'APPLY_CHOICE',
          targetId: field.targetId,
          labels,
        });
        if (result.ok) {
          flash(t('insert_selected', 'Selected'));
          await answer.save('insert');
        } else
          message.value =
            result.reason === 'NO_MATCH'
              ? NO_MATCH
              : result.reason === 'TARGET_GONE'
                ? TARGET_GONE
                : COPY_FALLBACK;
      } catch (err) {
        message.value = err instanceof ScriptUnavailable ? NEEDS_GESTURE : TARGET_GONE;
      } finally {
        busy.value = false;
      }
      return;
    }
    try {
      const result = await toPage<'INSERT_ANSWER'>({
        type: 'INSERT_ANSWER',
        targetId: field.targetId,
        text: answer.answer.value,
        mode,
      });
      if (result.ok) {
        flash(t('insert_inserted', 'Inserted'));
        await answer.save('insert');
        target.value = {
          ...field,
          currentValue:
            mode === 'append'
              ? `${field.currentValue ?? ''} ${answer.answer.value}`
              : answer.answer.value,
        };
      } else if (result.reason === 'TARGET_GONE') {
        message.value = TARGET_GONE;
      } else {
        await copyFallback(COPY_FALLBACK);
      }
    } catch (err) {
      message.value = err instanceof ScriptUnavailable ? NEEDS_GESTURE : TARGET_GONE;
    } finally {
      busy.value = false;
    }
  }

  async function copy() {
    if (await writeClipboard()) {
      flash(t('insert_copied', 'Copied'));
      await answer.save('copy');
    } else
      message.value = t(
        'insert_copy_failed',
        "Couldn't copy. Select the answer text and copy it with Ctrl+C.",
      );
  }

  async function pick() {
    message.value = '';
    picking.value = true;
    try {
      const picked = await toPage<'PICK_FIELD'>({ type: 'PICK_FIELD' });
      if (picked) target.value = picked;
    } catch (err) {
      message.value = err instanceof ScriptUnavailable ? NEEDS_GESTURE : TARGET_GONE;
    } finally {
      picking.value = false;
    }
  }

  function highlight(on: boolean) {
    const field = target.value;
    if (!field || field.inIframe) return;
    void toPage<'HIGHLIGHT_FIELD'>({ type: 'HIGHLIGHT_FIELD', targetId: field.targetId, on }).catch(
      () => undefined,
    );
  }

  async function saveToLibrary() {
    if (await answer.save('explicit')) flash(t('insert_saved', 'Saved'));
  }

  return {
    saveToLibrary,
    isChoice,
    target,
    picking,
    busy,
    message,
    toast,
    hasExisting,
    fillable,
    canInsert,
    insert,
    copy,
    pick,
    highlight,
  };
}
