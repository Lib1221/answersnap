import type { Message, Reply, StartSnipError } from '@/messaging/protocol';
import { sendToTab } from '@/messaging/send';
import {
  captureStatusItem,
  getSettings,
  pendingCaptureItem,
  readCaptureStatus,
} from '@/storage/items';
import type { CaptureErrorCode, CaptureStatus, PendingCapture, SnipMode } from '@/storage/schema';
import { cropCapture } from './crop';
import { classifyInjectError, ensureCaptureScript, isRestrictedUrl } from './inject';

/** captureVisibleTab is rate limited to about 2 calls per second. */
const CAPTURE_MIN_INTERVAL_MS = 550;
let lastCaptureAt = 0;

async function setStatus(status: Omit<CaptureStatus, 'updatedAt'>): Promise<void> {
  await captureStatusItem.setValue({ ...status, updatedAt: Date.now() });
}

interface SnipTarget {
  tabId: number;
  windowId: number;
  url?: string;
}

/** Inject the capture script and start the overlay. Safe to call without a gesture. */
export async function startSnip(target: SnipTarget, mode: SnipMode): Promise<Reply<'START_SNIP'>> {
  const captureId = crypto.randomUUID();
  const base = { captureId, mode, tabId: target.tabId, windowId: target.windowId };
  const fail = async (code: CaptureErrorCode): Promise<Reply<'START_SNIP'>> => {
    await setStatus({ ...base, state: 'error', code });
    return { ok: false, error: code as StartSnipError };
  };

  if (isRestrictedUrl(target.url)) return fail('RESTRICTED_PAGE');
  await setStatus({ ...base, state: 'selecting' });
  try {
    await ensureCaptureScript(target.tabId);
  } catch (err) {
    return fail(classifyInjectError(err));
  }
  try {
    await sendToTab(target.tabId, { type: 'BEGIN_SELECTION', captureId, mode });
  } catch {
    return fail('INJECT_FAILED');
  }
  return { ok: true };
}

/**
 * Entry point for real user gestures (shortcut, toolbar, context menu). `sidePanel.open`
 * must run before any await or Chrome drops the gesture.
 */
export function startSnipFromGesture(tab: Browser.tabs.Tab | undefined, mode: SnipMode): void {
  if (!tab?.id || tab.windowId === undefined) return;
  browser.sidePanel.open({ windowId: tab.windowId }).catch((err: unknown) => {
    console.warn('[AnswerSnap] could not open side panel', err);
  });
  void startSnip({ tabId: tab.id, windowId: tab.windowId, url: tab.url }, mode);
}

async function captureVisibleTab(windowId: number): Promise<string> {
  const wait = lastCaptureAt + CAPTURE_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCaptureAt = Date.now();
  try {
    return await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (err) {
    // One retry for the per-second quota.
    if (!/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(String(err))) throw err;
    await new Promise((r) => setTimeout(r, CAPTURE_MIN_INTERVAL_MS));
    lastCaptureAt = Date.now();
    return browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  }
}

export async function handleRegionSelected(
  msg: Message<'REGION_SELECTED'>,
  sender: Browser.runtime.MessageSender,
): Promise<Reply<'REGION_SELECTED'>> {
  const tab = sender.tab;
  const status = await readCaptureStatus();
  const known = status?.captureId === msg.captureId ? status : null;
  const tabId = tab?.id ?? known?.tabId;
  const windowId = tab?.windowId ?? known?.windowId;
  if (tabId === undefined || windowId === undefined) return { ok: true };
  const mode = known?.mode ?? 'question';
  const base = { captureId: msg.captureId, mode, tabId, windowId };

  await setStatus({ ...base, state: 'capturing' });
  const opts = await getSettings();
  let image: PendingCapture['image'];
  if (opts.sendScreenshot) {
    try {
      const shot = await captureVisibleTab(windowId);
      image = await cropCapture(shot, msg.rect, msg.viewport, { pad: opts.contextPadding });
    } catch (err) {
      console.warn('[AnswerSnap] capture failed', err);
      await setStatus({ ...base, state: 'error', code: 'CAPTURE_FAILED' });
      return { ok: true };
    }
  }

  const pending: PendingCapture = {
    id: msg.captureId,
    createdAt: Date.now(),
    mode,
    tabId,
    windowId,
    image,
    pageText: msg.pageText,
    hiddenTextChars: msg.hiddenTextChars,
    page: msg.page,
    field: msg.candidates[0],
    candidates: msg.candidates.slice(0, 5),
  };
  await pendingCaptureItem.setValue(pending);
  await setStatus({ ...base, state: 'done' });
  return { ok: true };
}

export async function handleSelectionCancelled(msg: Message<'SELECTION_CANCELLED'>): Promise<void> {
  const status = await readCaptureStatus();
  if (status?.captureId === msg.captureId) await setStatus({ ...status, state: 'cancelled' });
}
