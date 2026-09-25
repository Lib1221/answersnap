import type { StandardAnswers } from './profileSchema';

type Key = Exclude<keyof StandardAnswers, 'custom'>;

// Missing-info chip to standard answer field (spec 11.5). Order matters: more specific first.
const RULES: [RegExp, Key][] = [
  [/hourly|per hour|\brate\b/i, 'expectedHourlyRate'],
  [/salary|compensation|pay expectation|expected pay/i, 'expectedSalary'],
  [/sponsor/i, 'needsSponsorship'],
  [/authori[sz]|work permit|right to work|visa/i, 'workAuthorization'],
  [/relocat/i, 'willingToRelocate'],
  [/remote|on-?site|hybrid/i, 'remotePreference'],
  [/overlap/i, 'hoursOverlap'],
  [/time ?zone/i, 'timezone'],
  [/notice/i, 'noticePeriod'],
  [/start date|available from|availability|start working/i, 'availableFrom'],
  [/hours per week|weekly hours|hours a week/i, 'hoursPerWeek'],
  [/english/i, 'englishLevel'],
];

export function standardAnswerKeyFor(item: string): Key | null {
  return RULES.find(([re]) => re.test(item))?.[1] ?? null;
}

/** Options hash for a missing item: the matching field, or a new custom question. */
export function missingItemHash(item: string): string {
  const key = standardAnswerKeyFor(item);
  const params = new URLSearchParams(key ? { field: key } : { ask: item });
  return `standard-answers?${params}`;
}
