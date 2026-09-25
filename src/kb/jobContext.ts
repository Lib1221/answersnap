import { storage } from 'wxt/utils/storage';
import { z } from 'zod';
import { JOB_SUMMARY } from '@/llm/prompts';
import type { LlmProvider } from '@/llm/types';
import { normalizeText } from './normalize';

// Job context (spec 3.4): captured once per site, kept in storage.session for 12 hours.

export const JOB_TTL_MS = 12 * 60 * 60 * 1000;
/** Above this, a summary from the fast model goes into prompts; the original is kept too. */
export const JOB_SUMMARY_THRESHOLD = 6000;
export const JOB_TEXT_LIMIT = 60_000;

export const JobContextSchema = z.object({
  hostname: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  text: z.string(),
  summary: z.string().nullable(),
  createdAt: z.string(),
});
export type JobContext = z.infer<typeof JobContextSchema>;

function key(hostname: string) {
  return `session:jobContext:${hostname}` as const;
}

export async function getJobContext(
  hostname: string,
  now = Date.now(),
): Promise<JobContext | null> {
  const raw = await storage.getItem<unknown>(key(hostname));
  const parsed = JobContextSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (now - Date.parse(parsed.data.createdAt) > JOB_TTL_MS) {
    await storage.removeItem(key(hostname));
    return null;
  }
  return parsed.data;
}

export async function setJobContext(ctx: JobContext): Promise<void> {
  await storage.setItem(key(ctx.hostname), JobContextSchema.parse(ctx));
}

export async function clearJobContext(hostname: string): Promise<void> {
  await storage.removeItem(key(hostname));
}

export function watchJobContext(hostname: string, cb: () => void): () => void {
  return storage.watch(key(hostname), cb);
}

/** Text that goes into <job_context>: the summary when there is one. */
export function jobPromptText(ctx: JobContext | null): string | null {
  if (!ctx) return null;
  return ctx.summary ?? ctx.text;
}

/** "Backend Engineer at Acme" from the summary's first line, else the page title. */
export function parseRoleLine(
  summary: string | null,
  pageTitle: string,
): { title: string | null; company: string | null } {
  const first = summary?.split('\n').find((l) => l.trim());
  const m = first?.match(/^(?:role:\s*)?(.+?)\s+at\s+(.+?)\.?$/i);
  if (m) return { title: m[1]!.trim(), company: m[2]!.trim() };
  const t = pageTitle.replace(/\s*[|\-–—]\s*(careers|jobs|apply|job application).*$/i, '').trim();
  return { title: t || null, company: null };
}

export function jobLabel(ctx: JobContext): string {
  if (ctx.title && ctx.company) return `${ctx.title} at ${ctx.company}`;
  return ctx.title ?? ctx.company ?? ctx.hostname;
}

/**
 * Build the context from captured text, appending to an existing post for "Add more".
 * Long posts are summarized once with the fast model.
 */
export async function buildJobContext(opts: {
  hostname: string;
  pageTitle: string;
  text: string;
  existing?: JobContext | null;
  summarize?: { provider: LlmProvider; model: string };
}): Promise<JobContext> {
  const text = normalizeText([opts.existing?.text, opts.text].filter(Boolean).join('\n\n')).slice(
    0,
    JOB_TEXT_LIMIT,
  );
  let summary: string | null = null;
  if (text.length > JOB_SUMMARY_THRESHOLD && opts.summarize) {
    const result = await opts.summarize.provider.complete({
      model: opts.summarize.model,
      maxTokens: 1024,
      system: [
        { text: `${JOB_SUMMARY} Start with one line in the form "<role title> at <company>".` },
      ],
      messages: [
        { role: 'user', content: [{ type: 'text', text: `<job_post>\n${text}\n</job_post>` }] },
      ],
    });
    summary = normalizeText(result.text) || null;
  }
  const role = parseRoleLine(summary, opts.pageTitle);
  return {
    hostname: opts.hostname,
    title: role.title ?? opts.existing?.title ?? null,
    company: role.company ?? opts.existing?.company ?? null,
    text,
    summary,
    createdAt: new Date().toISOString(),
  };
}
