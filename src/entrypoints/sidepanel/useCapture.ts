import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { sendToBackground, sendToTab } from '@/messaging/send';
import {
  captureStatusItem,
  parseOrNull,
  pendingCaptureItem,
  readCaptureStatus,
  takePendingCapture,
} from '@/storage/items';
import {
  CaptureStatusSchema,
  type CaptureErrorCode,
  type CaptureStatus,
  type PendingCapture,
} from '@/storage/schema';

/** A status older than this is from an abandoned snip and is ignored. */
const STALE_MS = 10 * 60 * 1000;

export type PanelView =
  | { kind: 'idle' }
  | { kind: 'selecting' }
  | { kind: 'reading' }
  | { kind: 'captured'; capture: PendingCapture }
  | { kind: 'error'; code: CaptureErrorCode };

export function useCapture() {
  const status = ref<CaptureStatus | null>(null);
  // Image data lives in panel memory only, for the current question (hard rule 3).
  const capture = shallowRef<PendingCapture | null>(null);
  const busy = ref(false);

  const view = computed<PanelView>(() => {
    const s = status.value;
    const fresh = s && Date.now() - s.updatedAt < STALE_MS;
    const isCurrent = capture.value && s && capture.value.id === s.captureId;
    if (fresh && !isCurrent) {
      if (s.state === 'selecting') return { kind: 'selecting' };
      if (s.state === 'capturing' || s.state === 'done') return { kind: 'reading' };
      if (s.state === 'error' && s.code) return { kind: 'error', code: s.code };
    }
    if (capture.value) return { kind: 'captured', capture: capture.value };
    return { kind: 'idle' };
  });

  async function consume() {
    const next = await takePendingCapture(['question', 'field', 'job']);
    if (next) capture.value = next;
  }

  function setStatus(raw: unknown) {
    status.value = parseOrNull(CaptureStatusSchema, raw);
  }

  async function activeTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /** Snip from the panel button. Works only where activeTab is already granted (spec 4.1). */
  async function snip() {
    const tab = await activeTab();
    if (tab?.id === undefined) return;
    busy.value = true;
    try {
      await sendToBackground<'START_SNIP'>({ type: 'START_SNIP', tabId: tab.id, mode: 'question' });
    } finally {
      busy.value = false;
    }
  }

  async function allowAllSites() {
    const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
    if (granted) await snip();
  }

  async function cancelSelection() {
    const s = status.value;
    if (!s || s.state !== 'selecting') return;
    await sendToTab<'CANCEL_SELECTION'>(s.tabId, { type: 'CANCEL_SELECTION' }).catch(
      () => undefined,
    );
    status.value = { ...s, state: 'cancelled', updatedAt: Date.now() };
  }

  const unwatch: (() => void)[] = [];
  onMounted(async () => {
    unwatch.push(
      captureStatusItem.watch((v) => setStatus(v)),
      pendingCaptureItem.watch((v) => {
        if (v) void consume();
      }),
    );
    setStatus(await readCaptureStatus());
    await consume();
  });
  onUnmounted(() => unwatch.forEach((u) => u()));

  return { view, capture, busy, snip, allowAllSites, cancelSelection };
}
