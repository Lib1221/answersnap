import { ref, shallowRef, type Ref } from 'vue';
import { loadCandidateData } from '@/kb/candidate';
import { candidateBlock } from '@/kb/contextBuilder';
import { checkDealbreakers } from '@/kb/dealbreakers';
import type { Resume } from '@/kb/resume/model';
import { masterOf, saveResume, saveResumes } from '@/kb/resume/store';
import { applyTailoring, nextTrim, outlineResume, resumeText } from '@/kb/resume/tailorApply';
import {
  dropTailorRequest,
  getTailorRequest,
  type JobPost,
  type TailorRequest,
} from '@/kb/resume/tailoring';
import { describeError, LlmError } from '@/llm/errors';
import { createAppProvider } from '@/llm/provider';
import { runTailor, runTailoredLetter } from '@/llm/tailor';
import { getApiKey, getSettings } from '@/storage/items';

// The builder page's side of one-click tailoring: read the request the service worker saved,
// tailor the master resume, fit the result to two pages, and write the cover letter.

export type TailorPhase =
  'idle' | 'loading' | 'dealbreakers' | 'need-master' | 'tailoring' | 'fitting' | 'done' | 'error';

/** Two pages, as Liben asked: long enough for the experience, short enough to be read. */
export const TAILOR_MAX_PAGES = 2;

export interface TailorDeps {
  resumes: Ref<Resume[]>;
  current: Ref<Resume | null>;
  /** Save a new resume and open it. */
  add: (r: Resume) => Promise<void>;
  /** Resolves with the page count once the resume with this updatedAt has been measured. */
  measured: (updatedAt: string) => Promise<number>;
  /** Write pending edits first, so a whole-list save can't overwrite them. */
  flush: () => Promise<void>;
}

export function useTailor(deps: TailorDeps) {
  const phase = ref<TailorPhase>('idle');
  const job = shallowRef<JobPost | null>(null);
  const error = ref('');
  const letter = ref<'idle' | 'writing' | 'error'>('idle');
  const letterError = ref('');
  /** Dealbreakers the job hits, asked about before anything goes to the AI. */
  const hits = ref<string[]>([]);
  let request: TailorRequest | null = null;

  const findMaster = () => masterOf(deps.resumes.value);

  async function start(id: string) {
    phase.value = 'loading';
    request = await getTailorRequest(id);
    if (!request) {
      phase.value = 'error';
      error.value = 'This request has expired. Go back to the job and click Tailor resume again.';
      return;
    }
    job.value = request.job;
    // "Should I apply?": the candidate's own dealbreakers, checked in code before any AI call.
    hits.value = checkDealbreakers(request.job, (await getSettings()).dealbreakers).hits;
    if (hits.value.length) {
      phase.value = 'dealbreakers';
      return;
    }
    await proceed();
  }

  /** Go on with the tailoring (after the dealbreakers, when the candidate says so). */
  async function proceed() {
    const master = findMaster();
    if (!master) {
      phase.value = 'need-master';
      return;
    }
    await tailorFrom(master);
  }

  /** Skip the job: forget the request and close the tab it opened. */
  async function skip() {
    if (request) await dropTailorRequest(request.id);
    request = null;
    close();
    const tab = await browser.tabs.getCurrent().catch(() => undefined);
    if (tab?.id !== undefined) await browser.tabs.remove(tab.id).catch(() => undefined);
  }

  /**
   * Mark one resume as the master (and no other). Every resume whose flag changes gets a new
   * updatedAt, so this tab and others load the change instead of saving the old flag back.
   */
  async function makeMaster(r: Resume): Promise<Resume> {
    if (r.master && deps.resumes.value.filter((x) => x.master).length === 1) return r;
    await deps.flush();
    const now = new Date().toISOString();
    const list = deps.resumes.value.map((x) =>
      !!x.master === (x.id === r.id) ? x : { ...x, master: x.id === r.id, updatedAt: now },
    );
    await saveResumes(list);
    deps.resumes.value = list;
    return list.find((x) => x.id === r.id)!;
  }

  async function tailorFrom(chosen: Resume) {
    if (!request) return;
    error.value = '';
    phase.value = 'tailoring';
    try {
      const master = await makeMaster(chosen);
      const settings = await getSettings();
      const key = await getApiKey(settings.provider);
      if (!key) throw new Error('Add your AI key in Settings first.');
      const provider = createAppProvider(settings, key);
      const data = await loadCandidateData();
      const block = candidateBlock(data);
      const patch = await runTailor({
        provider,
        model: settings.model,
        settings,
        candidateBlock: block,
        masterOutline: outlineResume(master).text,
        job: request.job,
      });
      const { resume } = applyTailoring(master, patch, {
        job: request.job,
        applicationId: request.applicationId,
        knownText: [resumeText(master), block].join('\n'),
        fillGaps: settings.fillGaps,
      });
      await deps.add(resume);
      phase.value = 'fitting';
      await fit(TAILOR_MAX_PAGES, resume.id);
      await dropTailorRequest(request.id);
      // A reload opens the tailored resume instead of tailoring again.
      history.replaceState(null, '', `?id=${encodeURIComponent(resume.id)}`);
      phase.value = 'done';
      void writeLetter(resume.id);
    } catch (err) {
      phase.value = 'error';
      error.value = messageOf(err);
    }
  }

  /**
   * Cut the least relevant lines and projects until the new copy fits `max` pages. Only the open
   * resume is measured, so fitting stops if another one is opened meanwhile.
   */
  async function fit(max: number, id: string) {
    let count = await deps.measured(deps.current.value?.updatedAt ?? '');
    for (let i = 0; i < 40 && count > max; i++) {
      const r = deps.current.value;
      if (!r?.tailoring || r.id !== id) return;
      const trim = nextTrim(r);
      if (!trim) return;
      const stamp = `${new Date().toISOString().slice(0, 19)}.${String(i).padStart(3, '0')}Z`;
      deps.current.value = {
        ...trim.resume,
        updatedAt: stamp,
        tailoring: { ...r.tailoring, trimmed: [...r.tailoring.trimmed, trim.note] },
      };
      count = await deps.measured(stamp);
    }
  }

  /** Write the cover letter for a tailored copy (the open one when no id is given). */
  async function writeLetter(id = deps.current.value?.id) {
    const r =
      deps.current.value?.id === id
        ? deps.current.value
        : deps.resumes.value.find((x) => x.id === id);
    if (!r?.tailoring) return;
    letter.value = 'writing';
    letterError.value = '';
    try {
      // Facts from the master resume only: the copy's additions wait for the candidate's review.
      const source =
        deps.resumes.value.find((x) => x.id === r.tailoring!.sourceResumeId) ?? findMaster();
      if (!source)
        throw new Error(
          'The master resume this copy was made from is gone. Tailor again from your master.',
        );
      const settings = await getSettings();
      const key = await getApiKey(settings.provider);
      if (!key) throw new Error('Add your AI key in Settings first.');
      const text = await runTailoredLetter({
        provider: createAppProvider(settings, key),
        model: settings.model,
        settings,
        data: await loadCandidateData(),
        resumeText: resumeText(source),
        job: r.tailoring.job,
      });
      const now = new Date();
      const coverLetter = {
        text,
        recipient: r.tailoring.job.company ? `Hiring team, ${r.tailoring.job.company}` : '',
        date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        updatedAt: now.toISOString(),
      };
      const open = deps.current.value;
      if (open?.id === r.id) deps.current.value = { ...open, coverLetter };
      else {
        // Another resume was opened meanwhile: keep the letter with its own copy.
        await deps.flush();
        const stored = deps.resumes.value.find((x) => x.id === r.id);
        if (stored) await saveResume({ ...stored, coverLetter }, { create: false });
      }
      letter.value = 'idle';
    } catch (err) {
      letter.value = 'error';
      letterError.value = messageOf(err);
    }
  }

  /** Try again after an error, from the master (or the only resume). */
  async function retry() {
    const master = findMaster();
    if (!request) return;
    if (master) await tailorFrom(master);
    else phase.value = 'need-master';
  }

  /** Leave the tailoring view (after an error, or instead of choosing a master). */
  function close() {
    phase.value = 'idle';
    error.value = '';
    history.replaceState(null, '', location.pathname);
  }

  return {
    phase,
    job,
    error,
    letter,
    letterError,
    hits,
    start,
    proceed,
    skip,
    tailorFrom,
    retry,
    close,
    writeLetter,
    makeMaster,
  };
}

/** Our own errors say what to do; API errors get the app's usual wording. */
export function messageOf(err: unknown): string {
  if (err instanceof LlmError || !(err instanceof Error)) return describeError(err);
  if (/quota/i.test(err.message)) return STORAGE_FULL;
  return err.message;
}

export const STORAGE_FULL =
  "Chrome's storage for AnswerSnap is full. Delete resumes you no longer need, then try again.";
