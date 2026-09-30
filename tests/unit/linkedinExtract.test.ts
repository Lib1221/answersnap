// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLayout, extractLinkedInJob, jobIdFromUrl, paneJobId } from '@/linkedin/extract';

const page = (name: string) =>
  new DOMParser().parseFromString(
    readFileSync(join(import.meta.dirname, '../fixtures/pages/linkedin', name), 'utf8'),
    'text/html',
  );

describe('LinkedIn job pages', () => {
  it('finds the job id on view, search, and collections URLs', () => {
    expect(jobIdFromUrl('https://www.linkedin.com/jobs/view/4012345678/')).toBe('4012345678');
    expect(
      jobIdFromUrl(
        'https://www.linkedin.com/jobs/view/senior-backend-engineer-at-northwind-4012345678',
      ),
    ).toBe('4012345678');
    expect(
      jobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=python'),
    ).toBe('4012345678');
    expect(
      jobIdFromUrl(
        'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678',
      ),
    ).toBe('4012345678');
    expect(jobIdFromUrl('https://www.linkedin.com/feed/')).toBeNull();
    expect(jobIdFromUrl('https://evil.example/jobs/view/4012345678/')).toBeNull();
  });

  it('reads the logged-in two-pane view', () => {
    const job = extractLinkedInJob(
      page('jobs-search.html'),
      'https://www.linkedin.com/jobs/search/?currentJobId=4012345678',
    )!;
    expect(job.jobId).toBe('4012345678');
    expect(job.url).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    expect(job.title).toBe('Senior Backend Engineer');
    expect(job.company).toBe('Northwind');
    expect(job.location).toBe('European Union');
    expect(job.workplace).toBe('Remote');
    expect(job.text).toContain('5+ years of backend engineering with Python and Django.');
    expect(job.text).toContain("We don't sponsor visas.");
    expect(job.text.startsWith('About the job')).toBe(false);
  });

  it('falls back to JSON-LD when the page shows only a teaser', () => {
    const job = extractLinkedInJob(
      page('job-guest.html'),
      'https://www.linkedin.com/jobs/view/4099/',
    )!;
    // "4099" is too short to be a job id; the URL stays as given.
    expect(job.title).toBe('Data Engineer');
    expect(job.company).toBe('Northwind');
    expect(job.location).toBe('Berlin, Berlin, Germany');
    expect(job.text).toContain('- Python, SQL, Airflow');
    expect(job.text).toContain('German B2 required.');
  });

  it('gives up on a page without a real description', () => {
    const doc = new DOMParser().parseFromString(
      '<main><h1 class="top-card-layout__title">Engineer</h1><p>Sign in to see more.</p></main>',
      'text/html',
    );
    expect(extractLinkedInJob(doc, 'https://www.linkedin.com/jobs/view/4012345678/')).toBeNull();
  });

  it("reads LinkedIn's new layout by its stable hooks, never the job cards or the company blurb", () => {
    const doc = page('jobs-sdui.html');
    expect(detectLayout(doc)).toBe('sdui');
    expect(paneJobId(doc)).toBe('4099887766');
    const job = extractLinkedInJob(
      doc,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4099887766',
    )!;
    expect(job).toMatchObject({
      jobId: '4099887766',
      title: 'Machine Learning Engineer',
      company: 'Fabrikam',
      location: 'Addis Ababa, Ethiopia',
      workplace: 'Remote',
    });
    expect(job.text).toContain('Train and evaluate NLP and computer vision models');
    expect(job.text).toContain('Remote within Africa');
    expect(job.text).not.toContain('… more');
    expect(job.text).not.toContain('Contoso');
    expect(job.text).not.toContain('company blurb');
  });

  it('takes the company from the page, and a title with bars of its own whole', () => {
    const doc = page('jobs-sdui.html');
    doc.title = '(2) Machine Learning Engineer | NLP | Remote | Fabrikam | LinkedIn';
    const job = extractLinkedInJob(
      doc,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4099887766',
    )!;
    expect(job.title).toBe('Machine Learning Engineer | NLP | Remote');
    expect(job.company).toBe('Fabrikam');
  });

  it('refuses a post too short to use rather than read the rest of the pane', () => {
    const doc = page('jobs-sdui.html');
    doc.querySelector('[data-testid="expandable-text-box"]')!.textContent =
      'ML engineer wanted. Details on our careers site.';
    const job = extractLinkedInJob(
      doc,
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4099887766',
    );
    expect(job?.text ?? '').not.toContain('company blurb');
    expect(job?.text ?? '').not.toContain('Easy Apply');
  });

  it('knows when the pane still shows the previous job', () => {
    const doc = page('jobs-sdui.html');
    // The URL moved on to another job; the pane still says 4099887766.
    expect(paneJobId(doc)).not.toBe(
      jobIdFromUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4012345678'),
    );
    expect(paneJobId(page('jobs-search.html'))).toBe('4012345678');
  });

  it("reads the public page's own description when it's there", () => {
    const doc = page('job-guest.html');
    expect(detectLayout(doc)).toBe('guest');
  });
});
