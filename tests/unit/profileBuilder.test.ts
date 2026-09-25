// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@/config/defaults';
import { buildSystemBlocks } from '@/kb/contextBuilder';
import { buildProfile, changedSections, mergeProfiles, sourcesDocument } from '@/kb/profileBuilder';
import {
  CandidateProfileSchema,
  filledStandardAnswers,
  profileJsonSchema,
  StandardAnswersSchema,
} from '@/kb/profileSchema';
import { AnthropicProvider } from '@/llm/anthropic';
import { GeminiProvider } from '@/llm/gemini';
import type { CompleteRequest, LlmProvider } from '@/llm/types';
import type { KnowledgeSource } from '@/storage/schema';

const profile = CandidateProfileSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/profile.json'), 'utf8')),
);
const resume: KnowledgeSource = {
  id: 'r',
  kind: 'resume',
  label: 'Resume',
  text: 'Jamie Park, Backend Engineer',
  chars: 28,
  importedAt: '',
  enabled: true,
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('profile schema', () => {
  it('produces a simple JSON Schema for structured outputs', () => {
    const schema = JSON.stringify(profileJsonSchema());
    expect(schema).not.toContain('$schema');
    expect(schema).not.toMatch(/"pattern"|"minLength"|"maxLength"|"minimum"|"maximum"/);
    expect(profileJsonSchema()).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('accepts the fixture profile', () => {
    expect(profile.fullName).toBe('Jamie Park');
  });
});

describe('buildProfile', () => {
  const fakeProvider = (result: unknown, seen: CompleteRequest[] = []): LlmProvider => ({
    listModels: async () => [],
    stream: async () => ({
      text: '',
      stopReason: '',
      usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    }),
    prewarm: async () => null,
    complete: async (req) => {
      seen.push(req);
      return {
        text: JSON.stringify(result),
        json: result,
        stopReason: 'end_turn',
        usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
      };
    },
  });

  it('sends enabled sources with the schema and validates the result', async () => {
    const seen: CompleteRequest[] = [];
    const disabled = { ...resume, id: 'x', label: 'Old', text: 'secret old text', enabled: false };
    const out = await buildProfile(fakeProvider(profile, seen), 'claude-sonnet-5', [
      resume,
      disabled,
    ]);
    expect(out).toEqual(profile);
    expect(seen[0]!.schemaName).toBe('save_profile');
    expect(JSON.stringify(seen[0]!.messages)).toContain('Jamie Park, Backend Engineer');
    expect(JSON.stringify(seen[0]!.messages)).not.toContain('secret old text');
  });

  it('fills missing arrays and rejects the wrong shape', async () => {
    const out = await buildProfile(
      fakeProvider({
        fullName: 'Jamie Park',
        headline: null,
        location: null,
        email: null,
        phone: null,
        summary: null,
      }),
      'm',
      [resume],
    );
    expect(out.experience).toEqual([]);
    await expect(
      buildProfile(fakeProvider({ experience: 'lots' }), 'm', [resume]),
    ).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('needs at least one source', async () => {
    await expect(buildProfile(fakeProvider(profile), 'm', [])).rejects.toMatchObject({
      kind: 'bad_request',
    });
  });

  it('wraps source labels safely', () => {
    expect(sourcesDocument([{ ...resume, label: 'My "CV" <v2>' }])).toContain(
      '<source label="My CV v2" kind="resume">',
    );
  });
});

describe('structured output fallbacks', () => {
  const req = (model: string): CompleteRequest => ({
    model,
    maxTokens: 8192,
    system: [{ text: 'Extract.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'doc' }] }],
    jsonSchema: profileJsonSchema(),
    schemaName: 'save_profile',
  });

  it('Anthropic uses output_config.format first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(200, {
        content: [{ type: 'text', text: JSON.stringify(profile) }],
        stop_reason: 'end_turn',
        usage: {},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await new AnthropicProvider('k').complete(req('claude-sonnet-5'));
    expect(out.json).toEqual(profile);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body).not.toHaveProperty('stream');
  });

  it('Anthropic falls back to forced tool use on a 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(400, {
          error: {
            type: 'invalid_request_error',
            message: 'output_config.format is not supported',
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          content: [{ type: 'tool_use', name: 'save_profile', input: profile }],
          stop_reason: 'tool_use',
          usage: {},
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const out = await new AnthropicProvider('k').complete(req('claude-haiku-4-5-20251001'));
    expect(out.json).toEqual(profile);
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'save_profile' });
    expect(body.tools[0].name).toBe('save_profile');
  });

  it('Anthropic uses auto tool choice on models that reject forced tool use', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(400, { error: { message: 'format not supported' } }))
      .mockResolvedValueOnce(
        json(200, {
          content: [{ type: 'tool_use', name: 'save_profile', input: profile }],
          usage: {},
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await new AnthropicProvider('k').complete(req('claude-opus-5-5'));
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.system.at(-1).text).toBe('Call the save_profile tool with the result.');
  });

  it('Gemini uses responseJsonSchema, then plain JSON mode on a 400', async () => {
    const reply = json(200, {
      candidates: [
        { content: { parts: [{ text: JSON.stringify(profile) }] }, finishReason: 'STOP' },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(400, {
          error: { code: 400, message: 'Invalid JSON schema', status: 'INVALID_ARGUMENT' },
        }),
      )
      .mockResolvedValueOnce(reply);
    vi.stubGlobal('fetch', fetchMock);
    const out = await new GeminiProvider('k').complete(req('gemini-3.8-flash'));
    expect(out.json).toEqual(profile);
    const first = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const second = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(first.generationConfig.responseJsonSchema).toBeDefined();
    expect(second.generationConfig.responseJsonSchema).toBeUndefined();
    expect(second.generationConfig.responseMimeType).toBe('application/json');
    expect(second.systemInstruction.parts.at(-1).text).toContain(
      'Reply with JSON matching this schema',
    );
  });
});

describe('rebuild comparison', () => {
  it('finds changed sections and merges per choice', () => {
    const next = structuredClone(profile);
    next.headline = 'Senior Backend Engineer';
    next.skills.push({ name: 'Kafka', years: null, evidence: null });
    expect(changedSections(profile, next)).toEqual(['basics', 'skills']);
    const merged = mergeProfiles(profile, next, { basics: 'mine', skills: 'new' });
    expect(merged.headline).toBe('Backend Engineer');
    expect(merged.skills.at(-1)!.name).toBe('Kafka');
  });
});

describe('candidate block', () => {
  it('includes the profile and only filled standard answers', () => {
    const sa = StandardAnswersSchema.parse({
      timezone: 'UTC+0',
      custom: [
        { id: '1', question: 'Start in two weeks?', answer: 'Yes' },
        { id: '2', question: '', answer: '' },
      ],
    });
    const [, candidate] = buildSystemBlocks(defaultSettings(), {
      profile,
      standardAnswers: filledStandardAnswers(sa),
      sources: [],
    });
    expect(candidate!.text).toContain('<candidate_profile>');
    expect(candidate!.text).toContain('"timezone": "UTC+0"');
    expect(candidate!.text).toContain('Start in two weeks?');
    expect(candidate!.text).not.toContain('expectedHourlyRate');
    expect(filledStandardAnswers(StandardAnswersSchema.parse({}))).toBeNull();
  });
});
