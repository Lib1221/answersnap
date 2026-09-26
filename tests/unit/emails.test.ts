import { describe, expect, it } from 'vitest';
import { emailQuestion, mailtoUrl, splitEmail } from '@/kb/emails';

describe('emails', () => {
  it('builds the request for each kind', () => {
    const q = emailQuestion({
      kind: 'follow-up',
      company: 'Acme',
      role: 'Backend Engineer',
      recipient: '',
      notes: 'applied on Sept 1',
    });
    expect(q).toContain(
      'a polite follow-up email about an application that has had no reply yet about the Backend Engineer role at Acme.',
    );
    expect(q).toContain('neutral greeting');
    expect(q).toContain('Details from the candidate to use: applied on Sept 1');
    expect(
      emailQuestion({ kind: 'decline', company: 'Acme', role: '', recipient: 'Sam', notes: '' }),
    ).toContain('to Acme.\nAddress it to Sam.');
  });

  it('splits the subject and builds a mailto link', () => {
    const text = 'Subject: Thanks & next steps\n\nHello Dana,\n\nThanks!';
    expect(splitEmail(text)).toEqual({
      subject: 'Thanks & next steps',
      body: 'Hello Dana,\n\nThanks!',
    });
    expect(splitEmail('Hello')).toEqual({ subject: '', body: 'Hello' });
    expect(mailtoUrl(text)).toBe(
      'mailto:?subject=Thanks%20%26%20next%20steps&body=Hello%20Dana%2C%0A%0AThanks!',
    );
  });
});
