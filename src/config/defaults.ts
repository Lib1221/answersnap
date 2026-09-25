/**
 * Capture options until the Settings store lands in M2 (spec 7.2 defaults:
 * sendScreenshot true, contextPadding true).
 */
export const DEFAULT_CAPTURE_OPTIONS = {
  sendScreenshot: true,
  contextPadding: true,
} as const;
