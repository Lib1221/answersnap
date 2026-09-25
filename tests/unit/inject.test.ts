import { describe, expect, it } from 'vitest';
import { classifyInjectError, isRestrictedUrl } from '@/background/inject';

describe('isRestrictedUrl', () => {
  it.each([
    'chrome://extensions/',
    'edge://settings',
    'chrome-extension://abc/options.html',
    'view-source:https://example.com',
    'https://chromewebstore.google.com/detail/x',
    'https://chrome.google.com/webstore/detail/x',
  ])('blocks %s', (url) => expect(isRestrictedUrl(url)).toBe(true));

  it('allows normal pages and unknown URLs', () => {
    expect(isRestrictedUrl('https://jobs.example.com/apply')).toBe(false);
    expect(isRestrictedUrl(undefined)).toBe(false);
  });
});

describe('classifyInjectError', () => {
  it('maps Chrome errors to panel states', () => {
    expect(classifyInjectError(new Error('Cannot access a chrome:// URL'))).toBe('RESTRICTED_PAGE');
    expect(classifyInjectError(new Error('The extensions gallery cannot be scripted.'))).toBe(
      'RESTRICTED_PAGE',
    );
    expect(
      classifyInjectError(
        new Error(
          'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
        ),
      ),
    ).toBe('NEEDS_GESTURE');
    expect(classifyInjectError(new Error('No tab with id: 5'))).toBe('INJECT_FAILED');
  });
});
