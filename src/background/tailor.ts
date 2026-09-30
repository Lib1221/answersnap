import { trackJob } from '@/kb/applications';
import { setJobContext } from '@/kb/jobContext';
import { parseJobPost, saveTailorRequest } from '@/kb/resume/tailoring';
import type { Message, Reply } from '@/messaging/protocol';
import { getSettings } from '@/storage/items';

// One-click tailoring, service worker side: a job post arrives from LinkedIn's Tailor button or
// the side panel; track the application, keep the post as the site's job context (so the side
// panel's Job tools see it too), and open the resume builder next to the job's tab.

/** Pages allowed to send a job post: LinkedIn (the content script) and our own extension pages. */
export function senderAllowed(sender: Browser.runtime.MessageSender, e2e = false): boolean {
  if (sender.id !== browser.runtime.id) return false;
  const url = sender.url ?? sender.tab?.url ?? '';
  if (url.startsWith(browser.runtime.getURL('/'))) return true;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'www.linkedin.com') return true;
    // The e2e fixture server stands in for LinkedIn in tests (compiled out of production).
    return e2e && u.hostname === '127.0.0.1' && u.pathname.startsWith('/linkedin/');
  } catch {
    return false;
  }
}

export async function handleTailorJob(
  msg: Message<'TAILOR_JOB'>,
  sender: Browser.runtime.MessageSender,
): Promise<Reply<'TAILOR_JOB'>> {
  if (!senderAllowed(sender, import.meta.env.MODE === 'e2e'))
    return { ok: false, error: 'NOT_ALLOWED' };
  const job = parseJobPost(msg.job);
  if (!job) return { ok: false, error: 'NO_JOB' };

  const app = await trackJob({
    hostname: job.hostname,
    url: job.url || undefined,
    company: job.company || null,
    role: job.title || null,
  });
  await setJobContext({
    hostname: job.hostname,
    title: job.title || null,
    company: job.company || null,
    text: job.text,
    summary: null,
    createdAt: new Date().toISOString(),
  });
  const request = await saveTailorRequest(job, app.id);
  // From LinkedIn: next to the job's tab. From the side panel: next to the tab in front.
  const tab =
    sender.tab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  await browser.tabs.create({
    url: browser.runtime.getURL(`/resume.html?tailor=${request.id}`),
    ...(tab ? { index: tab.index + 1, openerTabId: tab.id, windowId: tab.windowId } : {}),
  });
  return { ok: true };
}

export async function handleLinkedInButton(
  sender: Browser.runtime.MessageSender,
): Promise<Reply<'LINKEDIN_BUTTON'>> {
  if (!senderAllowed(sender, import.meta.env.MODE === 'e2e')) return { show: false };
  return { show: (await getSettings()).linkedinButton };
}
