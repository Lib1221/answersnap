import { describe, expect, it } from 'vitest';
import { cleanAnswer, parseTagged, TagParser } from '@/llm/tagParser';

const FULL =
  '<question>How many years of Python?</question>\n<type>number</type>\n<answer>5</answer>\n<missing></missing>\n<notes></notes>';

describe('TagParser', () => {
  it('streams answer text as it arrives, across split tags', () => {
    const p = new TagParser();
    const seen: string[] = [];
    for (const chunk of [
      '<question>Why us?</question><type>long_',
      'text</type><ans',
      'wer>I build ',
      'payment APIs.</an',
      'swer><missing></missing>',
    ]) {
      p.push(chunk);
      seen.push(p.answerSoFar);
    }
    expect(seen).toEqual(['', '', 'I build ', 'I build payment APIs.', 'I build payment APIs.']);
    expect(p.finish().answer).toBe('I build payment APIs.');
  });

  it('parses every field', () => {
    expect(parseTagged(FULL)).toEqual({
      question: 'How many years of Python?',
      type: 'number',
      answer: '5',
      missing: [],
      notes: '',
      usedFallback: false,
    });
  });

  it('splits missing items and drops "none"', () => {
    const r = parseTagged(
      '<type>salary</type><answer>[[rate]]</answer><missing>expected hourly rate; start date</missing>',
    );
    expect(r.missing).toEqual(['expected hourly rate', 'start date']);
    expect(parseTagged('<answer>x</answer><missing>none</missing>').missing).toEqual([]);
  });

  it('falls back to the whole output when there is no answer tag', () => {
    const r = parseTagged('<type>short_text</type>\nI have five years of Python.');
    expect(r.usedFallback).toBe(true);
    expect(r.answer).toBe('I have five years of Python.');
  });

  it('returns an empty answer for assessments', () => {
    const r = parseTagged('<type>assessment</type><answer>False</answer>');
    expect(r.type).toBe('assessment');
    expect(r.answer).toBe('');
  });

  it('treats unknown types as unclear', () => {
    expect(parseTagged('<type>essay</type><answer>x</answer>').type).toBe('unclear');
  });
});

describe('cleanAnswer', () => {
  it('replaces dashes used as pauses and keeps ranges', () => {
    expect(cleanAnswer('I led the rewrite — it cut costs.')).toBe(
      'I led the rewrite, it cut costs.',
    );
    expect(cleanAnswer('From 2019–2021 I worked at Acme.')).toBe(
      'From 2019-2021 I worked at Acme.',
    );
  });

  it('strips wrapping quotes and markdown emphasis', () => {
    expect(cleanAnswer('"I use **Django** and *Vue* daily."')).toBe('I use Django and Vue daily.');
  });

  it('leaves snake_case and math alone', () => {
    expect(cleanAnswer('I named it user_id and computed 2*3*4.')).toBe(
      'I named it user_id and computed 2*3*4.',
    );
  });
});
