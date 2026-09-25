import { startCaptureRuntime } from '@/capture/runtime';

// Injected on demand under activeTab (never a registered content script, see spec 5.3).
export default defineUnlistedScript(() => {
  const w = window as unknown as { __answersnap?: boolean };
  if (w.__answersnap) return;
  w.__answersnap = true;
  startCaptureRuntime(); // registers the runtime.onMessage listener
});
