// Follow-up emails for the job in front: thank-you notes, follow-ups, offer replies. Drafted by the
// answer engine like cover letters; the first line of the draft is the subject.

export type EmailKind = 'thank-you' | 'follow-up' | 'check-in' | 'accept' | 'decline' | 'withdraw';

export const EMAIL_KINDS: Record<EmailKind, { label: string; ask: string; notesHint: string }> = {
  'thank-you': {
    label: 'Thank you after an interview',
    ask: 'a thank-you email to send the day after an interview',
    notesHint: 'Who you met, and something specific you talked about',
  },
  'follow-up': {
    label: 'Follow up after applying',
    ask: 'a polite follow-up email about an application that has had no reply yet',
    notesHint: 'When you applied, and anything new since then',
  },
  'check-in': {
    label: 'Check in after an interview',
    ask: 'a short email checking in on next steps after an interview',
    notesHint: 'When you interviewed, and what they said about timing',
  },
  accept: {
    label: 'Accept an offer',
    ask: 'an email accepting a job offer',
    notesHint: 'Start date, and anything you agreed on',
  },
  decline: {
    label: 'Decline an offer',
    ask: 'an email politely declining a job offer and keeping the door open',
    notesHint: 'A short reason, if you want to give one',
  },
  withdraw: {
    label: 'Withdraw my application',
    ask: 'an email politely withdrawing from the hiring process',
    notesHint: 'A short reason, if you want to give one',
  },
};

export const EMAIL_LENGTH = 'an email of 80 to 150 words';
export const EMAIL_MAX_CHARS = 2000;

export function emailQuestion(opts: {
  kind: EmailKind;
  company: string;
  role: string;
  recipient: string;
  notes: string;
}): string {
  const company = opts.company.trim();
  const role = opts.role.trim();
  const about =
    role && company
      ? ` about the ${role} role at ${company}`
      : role
        ? ` about the ${role} role`
        : company
          ? ` to ${company}`
          : '';
  const recipient = opts.recipient.trim();
  return [
    `Write ${EMAIL_KINDS[opts.kind].ask}${about}.`,
    recipient
      ? `Address it to ${recipient}.`
      : 'No recipient name is known, so use a neutral greeting like "Hello,".',
    'Format: the first line is "Subject: " and a short subject, then a blank line, the greeting, two or three short paragraphs, and a sign-off with the candidate\'s name. Plain text. Keep it warm, specific, and short; no flattery.',
    opts.notes.trim() ? `Details from the candidate to use: ${opts.notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Split "Subject: ..." off the top of a drafted email. */
export function splitEmail(text: string): { subject: string; body: string } {
  const m = text.match(/^\s*subject:\s*(.*)\n+/i);
  return m
    ? { subject: m[1]!.trim(), body: text.slice(m[0].length).trim() }
    : { subject: '', body: text.trim() };
}

export function mailtoUrl(text: string): string {
  const { subject, body } = splitEmail(text);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
