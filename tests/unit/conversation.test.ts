import { describe, expect, it } from 'vitest';
import {
  cutAtLastSentence,
  refineInstruction,
  refineLabel,
  refineMessages,
  swapAnswer,
} from '@/llm/conversation';
import type { ChatMessage } from '@/llm/types';

const limits = { maxChars: 1000, explicitChars: true };
const RAW =
  '<question>Why us?</question>\n<type>long_text</type>\n<answer>Original answer.</answer>\n<missing></missing>\n<notes></notes>';

describe('refinements', () => {
  it('swaps the edited answer into the previous output', () => {
    expect(swapAnswer(RAW, 'My edited answer.')).toBe(
      RAW.replace('Original answer.', 'My edited answer.'),
    );
    expect(swapAnswer('no tags here', 'Edited.')).toBe('no tags here\n<answer>Edited.</answer>');
  });

  it('appends assistant and instruction turns, keeping earlier turns as they were', () => {
    const first: ChatMessage = { role: 'user', content: [{ type: 'text', text: 'Q' }] };
    const msgs = refineMessages([first], RAW, 'Edited.', 'Shorter please.');
    expect(msgs[0]).toBe(first);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(JSON.stringify(msgs[1])).toContain('<answer>Edited.</answer>');
    expect(msgs[2]!.content).toEqual([{ type: 'text', text: 'Shorter please.' }]);
  });

  it('renders the spec instructions', () => {
    expect(refineInstruction({ kind: 'shorter' }, 500, limits)).toBe(
      'Rewrite the answer about 40% shorter. Keep the strongest specific facts. Same tags.',
    );
    expect(refineInstruction({ kind: 'longer' }, 500, limits)).toContain(
      'Stay under 1000 characters.',
    );
    expect(refineInstruction({ kind: 'tone', tone: 'casual' }, 500, limits)).toBe(
      'Rewrite the answer in a more casual tone. Same facts. Same tags.',
    );
    expect(refineInstruction({ kind: 'fit' }, 1240, limits)).toBe(
      'The answer is 1240 characters and the limit is 1000. Rewrite it to fit with a 5% margin. Same tags.',
    );
    expect(refineInstruction({ kind: 'custom', text: 'mention Celery.' }, 1, limits)).toBe(
      'Change request from the candidate: mention Celery. Apply it without adding facts that are not in the candidate data. Same tags.',
    );
  });
});

describe('cutAtLastSentence', () => {
  it('cuts at the last full sentence that fits', () => {
    expect(cutAtLastSentence('One two. Three four. Five six seven.', 22)).toBe(
      'One two. Three four.',
    );
    expect(cutAtLastSentence('Short.', 100)).toBe('Short.');
    expect(cutAtLastSentence('no sentence end here at all', 12)).toBe('no sentence');
  });
});

describe('versions', () => {
  it('names each refinement and asks for another angle', () => {
    expect(refineLabel({ kind: 'tone', tone: 'casual' })).toBe('More casual');
    expect(refineLabel({ kind: 'angle' })).toBe('Another angle');
    expect(refineLabel({ kind: 'custom', text: 'x' })).toBe('Your change');
    expect(refineInstruction({ kind: 'angle' }, 100, limits)).toContain(
      'lead with a different example or angle',
    );
  });
});
