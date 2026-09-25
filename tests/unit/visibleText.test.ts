import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVisibilityChecker } from '@/capture/hiddenText';
import { extractVisibleText } from '@/capture/visibleText';
import { installLayout, setBody } from './helpers/layout';

const sel = { x: 0, y: 0, w: 600, h: 400 };
let restore: () => void;

beforeEach(() => {
  restore = installLayout();
});
afterEach(() => restore());

const extract = (s = sel) => extractVisibleText(s, createVisibilityChecker());

describe('extractVisibleText', () => {
  it('keeps text inside the selection and drops text outside it', () => {
    setBody(`
      <p data-rect="10,10,300,20">How many years of Python?</p>
      <p data-rect="10,700,300,20">Footer links</p>`);
    expect(extract().text).toBe('How many years of Python?');
  });

  it('needs at least half of a text box inside the selection', () => {
    setBody(`
      <p data-rect="550,10,200,20">mostly outside</p>
      <p data-rect="450,40,200,20">mostly inside</p>`);
    expect(extract().text).toBe('mostly inside');
  });

  it('joins pieces on the same line with a space and new lines with a newline', () => {
    setBody(`
      <div data-rect="10,10,500,20"><b>Describe</b> <span data-rect="100,10,200,20">a project.</span></div>
      <div data-rect="10,40,500,20">Max 1000 characters.</div>`);
    expect(extract().text).toBe('Describe a project.\nMax 1000 characters.');
  });

  it('reads open shadow roots', () => {
    setBody(`<div id="host" data-rect="10,10,300,20"></div>`);
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    const p = document.createElement('p');
    p.textContent = 'Question inside shadow DOM';
    shadow.appendChild(p);
    expect(extract().text).toBe('Question inside shadow DOM');
  });

  it('skips scripts, styles, and our own overlay host', () => {
    setBody(`
      <div data-rect="10,10,300,20">Visible<script>var x = 1;</script><style>p{}</style></div>
      <answersnap-overlay data-rect="0,0,600,400">Overlay text</answersnap-overlay>`);
    const skip = document.querySelector('answersnap-overlay');
    expect(extractVisibleText(sel, createVisibilityChecker(), { skip }).text).toBe('Visible');
  });

  it('adds label, placeholder, and option lines for form controls', () => {
    setBody(`
      <label for="tz" data-rect="10,10,100,20">Time zone</label>
      <select id="tz" data-rect="10,40,200,24"><option>UTC</option><option>UTC+3</option></select>
      <input id="rate" placeholder="e.g. 40" data-rect="10,80,200,24">
      <div data-rect="10,120,300,24">
        <input type="radio" name="en" id="en1"><label for="en1">Fluent</label>
        <input type="radio" name="en" id="en2"><label for="en2">Native</label>
      </div>`);
    const { text } = extract();
    expect(text.split('\n')).toEqual([
      'Time zone',
      'Fluent Native',
      'Option: UTC',
      'Option: UTC+3',
      'Placeholder: e.g. 40',
      'Option: Fluent',
      'Option: Native',
    ]);
  });

  it('caps the text at 4,000 characters', () => {
    setBody(`<p data-rect="10,10,500,300">${'word '.repeat(2000)}</p>`);
    expect(extract().text.length).toBe(4000);
  });
});
