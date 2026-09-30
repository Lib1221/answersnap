import { describe, expect, it } from 'vitest';
import { checkDealbreakers, DealbreakersSchema, payIn } from '@/kb/dealbreakers';
import type { JobPost } from '@/kb/resume/tailoring';

// "Should I apply?": the candidate's dealbreakers against a post, in code.

const job = (over: Partial<JobPost> = {}): JobPost => ({
  url: 'https://www.linkedin.com/jobs/view/4012345678/',
  hostname: 'www.linkedin.com',
  title: 'Backend Engineer',
  company: 'Northwind',
  location: 'Lisbon, Portugal',
  workplace: 'Hybrid',
  text: 'Build payment APIs in Python and Django. '.repeat(4),
  ...over,
});
const rules = (over: Record<string, unknown> = {}) => DealbreakersSchema.parse(over);

describe('where the job is', () => {
  it('passes a job where the candidate can work, and flags one elsewhere', () => {
    const d = rules({ places: ['Portugal'] });
    expect(checkDealbreakers(job(), d).hits).toEqual([]);
    expect(checkDealbreakers(job({ location: 'Berlin, Germany' }), d).hits[0]).toContain(
      "It's in Berlin, Germany, outside where you can work",
    );
  });

  it("knows EMEA and the EU hold the candidate's country, and worldwide holds all", () => {
    const d = rules({ places: ['Kenya'] });
    expect(checkDealbreakers(job({ location: 'EMEA', workplace: 'Remote' }), d).hits).toEqual([]);
    expect(checkDealbreakers(job({ location: 'Worldwide' }), d).hits).toEqual([]);
    expect(
      checkDealbreakers(
        job({ location: 'Remote (EU)', workplace: 'Remote' }),
        rules({ places: ['Portugal'] }),
      ).hits,
    ).toEqual([]);
    expect(
      checkDealbreakers(job({ location: 'United States (Remote)', workplace: 'Remote' }), d)
        .hits[0],
    ).toContain('Remote in United States only');
  });

  it('flags hybrid and on-site jobs for a remote-only candidate', () => {
    expect(checkDealbreakers(job(), rules({ remoteOnly: true })).hits).toEqual([
      "It's a hybrid job, and you only want remote work.",
    ]);
    expect(
      checkDealbreakers(job({ workplace: 'Remote' }), rules({ remoteOnly: true })).hits,
    ).toEqual([]);
  });
});

describe('pay', () => {
  it('reads the pay a post states, with its period', () => {
    expect(payIn('Salary: $120,000 - $150,000 per year, plus equity.')).toEqual({
      currency: 'USD',
      low: 120000,
      high: 150000,
      period: 'year',
    });
    expect(payIn('We pay €60k–80k.')).toMatchObject({
      currency: 'EUR',
      high: 80000,
      period: 'year',
    });
    expect(payIn('Rate: $45/hr')).toMatchObject({ currency: 'USD', high: 45, period: 'hour' });
    expect(payIn('Join 3,000 engineers.')).toBeNull();
  });

  it('flags pay under the minimum, in the same currency only', () => {
    const d = rules({ minPay: 90000, currency: 'USD', period: 'year' });
    const low = job({ text: `${job().text} Pay: $30 - $40 an hour.` });
    expect(checkDealbreakers(low, d).hits[0]).toBe(
      'It pays up to USD 83,200 a year; your minimum is USD 90,000 a year.',
    );
    const euros = job({ text: `${job().text} Salary €50,000 a year.` });
    expect(checkDealbreakers(euros, d)).toEqual({
      hits: [],
      notes: ['The post pays in EUR; your minimum is in USD.'],
    });
    expect(checkDealbreakers(job(), d).notes).toEqual(['The post states no pay.']);
  });
});

describe('everything else', () => {
  it('flags no sponsorship, title words, companies, and words to avoid', () => {
    const d = rules({
      needsSponsorship: true,
      titleWords: ['Senior'],
      companies: ['Northwind'],
      avoidWords: ['security clearance'],
    });
    const v = checkDealbreakers(
      job({
        title: 'Senior Backend Engineer',
        text: `${job().text} We are unable to sponsor visas. An active security clearance is required.`,
      }),
      d,
    );
    expect(v.hits).toEqual([
      "The post doesn't sponsor visas, and you need sponsorship.",
      'The title says "Senior".',
      "It's at Northwind, a company on your list to skip.",
      'The post mentions "security clearance".',
    ]);
  });

  it('checks nothing until the candidate sets a rule', () => {
    expect(checkDealbreakers(job({ title: 'Senior Engineer' }), rules())).toEqual({
      hits: [],
      notes: [],
    });
  });
});
