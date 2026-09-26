import { fixFactsInstruction, type SentenceCheck } from './factCheck';
import type { Limits } from './limits';
import { REFINE } from './prompts';
import type { ChatMessage } from './types';

// Refinements are follow-up turns in the same conversation (spec 3.5, 11.2). The system blocks
// never change, so the prompt cache keeps hitting.

export type RefineAction =
  | { kind: 'shorter' }
  | { kind: 'longer' }
  | { kind: 'tone'; tone: 'formal' | 'casual' }
  | { kind: 'fit' }
  | { kind: 'custom'; text: string }
  | { kind: 'fix-facts'; unsupported: SentenceCheck[] }
  | { kind: 'angle' };

export function refineInstruction(
  action: RefineAction,
  answerChars: number,
  limits: Limits,
): string {
  switch (action.kind) {
    case 'shorter':
      return REFINE.shorter;
    case 'longer':
      return REFINE.longer(limits.maxChars);
    case 'tone':
      return REFINE.tone(action.tone);
    case 'fit':
      return REFINE.fitLimit(answerChars, limits.maxChars);
    case 'fix-facts':
      return fixFactsInstruction(action.unsupported);
    case 'custom':
      return REFINE.custom(action.text.trim().replace(/\.$/, ''));
    case 'angle':
      return REFINE.angle;
  }
}

/** Short name for a version made by this refinement, for the version switcher. */
export function refineLabel(action: RefineAction): string {
  switch (action.kind) {
    case 'shorter':
      return 'Shorter';
    case 'longer':
      return 'Longer';
    case 'tone':
      return action.tone === 'formal' ? 'More formal' : 'More casual';
    case 'fit':
      return 'Fit limit';
    case 'fix-facts':
      return 'Facts fixed';
    case 'custom':
      return 'Your change';
    case 'angle':
      return 'Another angle';
  }
}

/** Put the user's edited answer into the model's previous output, so refinements build on it. */
export function swapAnswer(raw: string, edited: string): string {
  const open = raw.indexOf('<answer>');
  const close = raw.indexOf('</answer>', open);
  if (open === -1 || close === -1) return `${raw.trim()}\n<answer>${edited}</answer>`;
  return `${raw.slice(0, open + '<answer>'.length)}${edited}${raw.slice(close)}`;
}

/** History for the next turn: previous turns, the (edited) answer, then the instruction. */
export function refineMessages(
  history: ChatMessage[],
  lastRaw: string,
  edited: string,
  instruction: string,
): ChatMessage[] {
  return [
    ...history,
    { role: 'assistant', content: [{ type: 'text', text: swapAnswer(lastRaw, edited) }] },
    { role: 'user', content: [{ type: 'text', text: instruction }] },
  ];
}

/** Cut at the last full sentence that fits (the "Cut at last sentence" button, spec 12). */
export function cutAtLastSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const end = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf('.\n'),
  );
  if (end > 0) return head.slice(0, end + 1).trim();
  if (/[.!?]$/.test(head)) return head.trim();
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trim();
}
