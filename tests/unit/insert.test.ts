import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editingHost, insertText, normalizeWs, setNativeValue } from '@/capture/insert';
import { setBody } from './helpers/layout';

beforeEach(() => setBody(''));

describe('setNativeValue', () => {
  it('sets the value and fires bubbling input and change events', () => {
    setBody('<form><input id="i"></form>');
    const input = document.getElementById('i') as HTMLInputElement;
    const events: string[] = [];
    const form = input.form!;
    form.addEventListener('input', () => events.push('input'));
    form.addEventListener('change', () => events.push('change'));
    setNativeValue(input, 'hello');
    expect(input.value).toBe('hello');
    expect(events).toEqual(['input', 'change']);
  });
});

describe('insertText into inputs and textareas', () => {
  it('replaces, turning newlines into spaces for single-line inputs', async () => {
    setBody('<input id="i" value="old">');
    const input = document.getElementById('i') as HTMLInputElement;
    expect(await insertText(input, 'Line one.\nLine two.', 'replace')).toEqual({
      ok: true,
      method: 'native-setter',
    });
    expect(input.value).toBe('Line one. Line two.');
  });

  it('appends with a blank line in textareas', async () => {
    setBody('<textarea id="t">Draft.</textarea>');
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    await insertText(ta, 'New answer.', 'append');
    expect(ta.value).toBe('Draft.\n\nNew answer.');
  });

  it('focuses, then blurs', async () => {
    setBody('<textarea id="t"></textarea>');
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    const focus = vi.spyOn(ta, 'focus');
    const blur = vi.spyOn(ta, 'blur');
    await insertText(ta, 'x', 'replace');
    expect(focus).toHaveBeenCalled();
    expect(blur).toHaveBeenCalled();
  });

  it('reports a failed verify when the page rewrites the value', async () => {
    setBody('<input id="i">');
    const input = document.getElementById('i') as HTMLInputElement;
    input.addEventListener('input', () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'MASKED',
      );
    });
    expect(await insertText(input, 'my answer', 'replace')).toEqual({
      ok: false,
      reason: 'VERIFY_FAILED',
    });
  });

  it('refuses disabled, missing, and iframe targets', async () => {
    setBody('<input id="d" disabled><iframe id="f"></iframe><div id="plain">text</div>');
    expect(await insertText(document.getElementById('d'), 'x', 'replace')).toEqual({
      ok: false,
      reason: 'NOT_FILLABLE',
    });
    expect(await insertText(null, 'x', 'replace')).toEqual({ ok: false, reason: 'TARGET_GONE' });
    expect(await insertText(document.getElementById('f'), 'x', 'replace')).toEqual({
      ok: false,
      reason: 'IN_IFRAME',
    });
    expect(await insertText(document.getElementById('plain'), 'x', 'replace')).toEqual({
      ok: false,
      reason: 'NOT_FILLABLE',
    });
  });
});

describe('editors', () => {
  it('finds the top-most editing host', () => {
    setBody('<div id="host" contenteditable="true"><p id="p">Hi</p></div>');
    expect(editingHost(document.getElementById('p')!)?.id).toBe('host');
  });

  it('normalizes whitespace for verification', () => {
    expect(normalizeWs('  a\n\n b\tc ')).toBe('a b c');
  });
});
