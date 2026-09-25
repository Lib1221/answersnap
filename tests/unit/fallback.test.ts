// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { LlmError, nextRetry } from '@/llm/errors';
import {
  AllModelsExhausted,
  cooldownUntil,
  FallbackProvider,
  msUntilPacificMidnight,
  orderedChain,
  type CooldownStore,
} from '@/llm/fallback';
import { quotaScope } from '@/llm/gemini';
import type { AnswerRequest, LlmProvider, StreamEvent } from '@/llm/types';

// The real error Google returned for a used-up daily quota (September 25, 2026).
const DAILY_DETAILS = [
  { '@type': 'type.googleapis.com/google.rpc.Help', links: [] },
  {
    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
    violations: [
      {
        quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
        quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
        quotaDimensions: { location: 'global', model: 'gemini-3.5-flash' },
        quotaValue: '20',
      },
    ],
  },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '15s' },
];

const req: AnswerRequest = { model: 'gemini-3.5-flash', maxTokens: 100, system: [], messages: [] };
const CHAIN = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash'];

function memoryCooldowns(
  initial: Record<string, number> = {},
): CooldownStore & { data: Record<string, number> } {
  const data = { ...initial };
  return {
    data,
    async get() {
      const now = Date.now();
      return Object.fromEntries(Object.entries(data).filter(([, u]) => u > now));
    },
    async set(m, until) {
      data[m] = until;
    },
  };
}

/** An inner provider where some models are out of quota. */
function fakeInner(exhausted: Record<string, 'day' | 'minute'>, calls: string[]): LlmProvider {
  const quota = (m: string) => new LlmError('rate_limit', `quota for ${m}`, 429, 15, exhausted[m]);
  return {
    listModels: async () => [],
    prewarm: async () => null,
    stream: async (r) => {
      calls.push(r.model);
      if (exhausted[r.model]) throw quota(r.model);
      return {
        text: `<answer>from ${r.model}</answer>`,
        stopReason: 'end_turn',
        usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      };
    },
    complete: async (r) => {
      calls.push(r.model);
      if (exhausted[r.model]) throw quota(r.model);
      return {
        text: 'ok',
        stopReason: 'end_turn',
        usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      };
    },
  };
}

describe('quota errors', () => {
  it('reads daily and per-minute scopes from QuotaFailure', () => {
    expect(quotaScope(DAILY_DETAILS)).toBe('day');
    expect(
      quotaScope([
        {
          '@type': 'x.QuotaFailure',
          violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }],
        },
      ]),
    ).toBe('minute');
    expect(quotaScope(undefined)).toBeUndefined();
  });

  it('does not retry a used-up daily quota, whatever retryDelay says', () => {
    const state = { rateLimitRetries: 0, serverRetries: 0, networkRetries: 0 };
    expect(nextRetry(new LlmError('rate_limit', 'x', 429, 15, 'day'), state, false)).toBeNull();
    expect(
      nextRetry(new LlmError('rate_limit', 'x', 429, 15, 'minute'), state, false),
    ).toMatchObject({ waitMs: 15000 });
  });
});

describe('cooldowns', () => {
  it('rests until midnight Pacific for the daily quota, about a minute otherwise', () => {
    // 10:00 at UTC-7 (Pacific daylight time) is 17:00 UTC; 14 hours to midnight.
    const now = Date.parse('2026-09-25T17:00:00Z');
    expect(msUntilPacificMidnight(now)).toBe(14 * 3600 * 1000);
    expect(cooldownUntil('day', now) - now).toBe(14 * 3600 * 1000);
    expect(cooldownUntil('minute', now) - now).toBe(65_000);
  });

  it('puts the chosen model first and keeps only models the key can use', () => {
    expect(orderedChain('gemini-3.7-flash', CHAIN)).toEqual([
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
    ]);
    expect(
      orderedChain('gemini-3.5-flash', CHAIN, ['gemini-3.5-flash', 'gemini-3.7-flash']),
    ).toEqual(['gemini-3.5-flash', 'gemini-3.7-flash']);
  });
});

describe('FallbackProvider', () => {
  it('switches to the next model on a quota error and remembers it', async () => {
    const calls: string[] = [];
    const cooldowns = memoryCooldowns();
    const switches: unknown[] = [];
    const p = new FallbackProvider(
      fakeInner({ 'gemini-3.5-flash': 'day' }, calls),
      (m) => orderedChain(m, CHAIN),
      cooldowns,
      (e) => switches.push(e),
    );
    const events: StreamEvent[] = [];
    const result = await p.stream(req, new AbortController().signal, (e) => events.push(e));
    expect(result.model).toBe('gemini-3.6-flash');
    expect(result.text).toContain('from gemini-3.6-flash');
    expect(events).toContainEqual({
      kind: 'fallback',
      from: 'gemini-3.5-flash',
      to: 'gemini-3.6-flash',
      reason: 'day',
    });
    expect(switches).toHaveLength(1);
    expect(cooldowns.data['gemini-3.5-flash']).toBeGreaterThan(Date.now() + 60_000);

    // The next request goes straight to the working model.
    calls.length = 0;
    await p.stream(req, new AbortController().signal, () => {});
    expect(calls).toEqual(['gemini-3.6-flash']);
  });

  it('keeps going down the chain, and reports when every model is out', async () => {
    const calls: string[] = [];
    const cooldowns = memoryCooldowns();
    const p = new FallbackProvider(
      fakeInner(
        { 'gemini-3.5-flash': 'day', 'gemini-3.6-flash': 'minute', 'gemini-3.7-flash': 'day' },
        calls,
      ),
      (m) => orderedChain(m, CHAIN),
      cooldowns,
    );
    const err = await p.stream(req, new AbortController().signal, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(AllModelsExhausted);
    expect(calls).toEqual(CHAIN);
    expect((err as AllModelsExhausted).resetsInMs).toBeLessThanOrEqual(65_000);

    // All resting: fails fast without calling anyone.
    calls.length = 0;
    await expect(p.stream(req, new AbortController().signal, () => {})).rejects.toBeInstanceOf(
      AllModelsExhausted,
    );
    expect(calls).toEqual([]);
  });

  it('passes other errors straight through', async () => {
    const inner = fakeInner({}, []);
    inner.stream = vi.fn().mockRejectedValue(new LlmError('auth', 'bad key', 401));
    const p = new FallbackProvider(inner, (m) => orderedChain(m, CHAIN), memoryCooldowns());
    await expect(p.stream(req, new AbortController().signal, () => {})).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(inner.stream).toHaveBeenCalledTimes(1);
  });

  it('falls back for non-streamed requests too (profile builds, summaries)', async () => {
    const calls: string[] = [];
    const p = new FallbackProvider(
      fakeInner({ 'gemini-3.5-flash': 'day' }, calls),
      (m) => orderedChain(m, CHAIN),
      memoryCooldowns(),
    );
    const out = await p.complete({ ...req });
    expect(out.model).toBe('gemini-3.6-flash');
  });
});
