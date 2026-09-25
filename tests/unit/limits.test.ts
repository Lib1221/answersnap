import { describe, expect, it } from 'vitest';
import { countWords, lengthGuide, parseLimits } from '@/llm/limits';
import type { FieldInfo } from '@/storage/schema';

const textarea = (extra: Partial<FieldInfo> = {}): FieldInfo => ({
  targetId: 'f1',
  kind: 'textarea',
  confidence: 'below',
  ...extra,
});

describe('parseLimits', () => {
  it.each([
    ['Describe a project. Max 500 characters.', 500],
    ['500 characters max', 500],
    ['Limit: 4,000', 4000],
    ['Up to 1.500 characters please', 1500],
    ['Answer within 300 chars', 300],
  ])('reads "%s"', (q, n) => {
    expect(parseLimits(q, textarea()).maxChars).toBe(n);
  });

  it.each([
    ['In 150 words or less, describe yourself.', 150],
    ['Up to 200 words.', 200],
    ['50 words max', 50],
  ])('reads word limits from "%s"', (q, n) => {
    expect(parseLimits(q, textarea()).maxWords).toBe(n);
  });

  it('reads counters from the field hint only', () => {
    expect(parseLimits('Why us?', textarea({ hint: '0/1000' })).maxChars).toBe(1000);
    expect(parseLimits('Available from 09/2026?', textarea()).maxChars).toBe(2500);
  });

  it('takes the smallest of several limits', () => {
    expect(
      parseLimits('Max 2,000 characters.', textarea({ maxLength: 1000, hint: '0/1500' })).maxChars,
    ).toBe(1000);
  });

  it('falls back to defaults by field kind', () => {
    expect(parseLimits('Name?', { targetId: 'f', kind: 'input', confidence: 'below' })).toEqual({
      maxChars: 300,
      explicitChars: false,
      maxWords: undefined,
    });
    expect(parseLimits('Why?', textarea()).maxChars).toBe(2500);
  });
});

describe('lengthGuide', () => {
  it('uses 70% of an explicit limit for textareas in auto mode', () => {
    const limits = parseLimits('Max 1000 characters.', textarea());
    expect(lengthGuide('auto', textarea(), limits)).toBe('at most 700 characters');
  });
});

it('counts words', () => {
  expect(countWords('  one two\nthree ')).toBe(3);
  expect(countWords('')).toBe(0);
});
