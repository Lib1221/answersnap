import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { storage } from 'wxt/utils/storage';
import { getApplicant, watchApplicant, type Applicant } from '@/kb/applicant';
import { loadCandidateData } from '@/kb/candidate';
import { buildSystemBlocks, hasCandidateData, todayIso } from '@/kb/contextBuilder';
import { checkEligibility, type Check } from '@/kb/eligibility';
import { planForm, type PlanItem } from '@/kb/identityFill';
import { getJobContext, jobPromptText } from '@/kb/jobContext';
import { getLibrary } from '@/kb/library';
import { draftForm, shouldInsertByDefault } from '@/llm/formFill';
import { runRequirements, type Requirements } from '@/llm/requirements';
import type { Message, MessageType, Reply, UploadInfo } from '@/messaging/protocol';
import { sendToBackground, sendToTab } from '@/messaging/send';
import { getApiKey, getSettings } from '@/storage/items';
import type { PageInfo } from '@/storage/schema';
import { t } from '@/ui/i18n';
import { jobTaskError, prepareJobTask } from './jobTask';
import type { useJob } from './useJob';

export interface Row {
  item: PlanItem;
  /** Where the value comes from: your details, the AI (essays), or nobody yet. */
  source: 'details' | 'ai' | 'you';
  value: string;
  insert: boolean;
  result?: 'inserted' | 'failed' | 'verified' | 'changed';
  /** What the page shows after inserting, when it differs. */
  pageShows?: string;
}

const CHOICE = ['select', 'radio-group', 'checkbox-group'];
/** Scholarship forms are long; Fill form's 40-field cap is too low here. */
const MAX_FIELDS = 150;

const GESTURE_HINT = () =>
  t(
    'sch_gesture_hint',
    'Press Alt+Shift+Q or click the AnswerSnap icon on the page first, then try again.',
  );

/** Documents ticked off, per program page. */
const checklistItem = storage.defineItem<Record<string, string[]>>('local:scholarshipChecklist', {
  fallback: {},
});

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function useScholarship(job: ReturnType<typeof useJob>) {
  const phase = ref<'idle' | 'scanning' | 'review' | 'inserting' | 'done'>('idle');
  const tabId = ref<number | null>(null);
  const page = shallowRef<PageInfo | null>(null);
  const rows = ref<Row[]>([]);
  const uploads = shallowRef<UploadInfo[]>([]);
  const error = ref('');
  const drafting = ref(false);
  const applicant = shallowRef<Applicant | null>(null);

  const loadApplicant = async () => {
    applicant.value = await getApplicant();
  };
  let unwatch: (() => void) | null = null;
  onMounted(() => {
    void loadApplicant();
    unwatch = watchApplicant(() => void loadApplicant());
  });
  onUnmounted(() => unwatch?.());

  async function toPage<T extends MessageType>(msg: Message<T>): Promise<Reply<T>> {
    if (tabId.value === null) throw new Error('no tab');
    try {
      return await sendToTab<T>(tabId.value, msg);
    } catch {
      const ready = await sendToBackground<'ENSURE_CAPTURE'>({
        type: 'ENSURE_CAPTURE',
        tabId: tabId.value,
      });
      if (!ready.ok) throw new Error(GESTURE_HINT());
      return sendToTab<T>(tabId.value, msg);
    }
  }

  function rowFor(item: PlanItem): Row {
    if (item.fill && !item.fill.skip) {
      const ok = !!item.fill.value && item.fill.issues.length === 0;
      // Never overwrite what's already on the page without the user ticking it.
      const filled = !!item.field.currentValue?.trim();
      return { item, source: 'details', value: item.fill.value, insert: ok && !filled };
    }
    if (item.essay) return { item, source: 'ai', value: '', insert: false };
    return { item, source: 'you', value: '', insert: false };
  }

  async function scan() {
    error.value = '';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    tabId.value = tab.id;
    phase.value = 'scanning';
    try {
      const result = await toPage<'SCAN_FORM'>({ type: 'SCAN_FORM', max: MAX_FIELDS });
      await loadApplicant();
      page.value = result.page;
      uploads.value = result.uploads ?? [];
      const plan = planForm(result.fields, applicant.value!, result.page);
      rows.value = plan.filter((p) => !(p.fill?.skip && !p.fill.value)).map(rowFor);
      phase.value = 'review';
      if (!result.fields.length)
        error.value = t('sch_no_fields', 'No form fields found on this page.');
    } catch (err) {
      phase.value = 'idle';
      error.value =
        err instanceof Error && err.message === GESTURE_HINT()
          ? err.message
          : t('sch_cant_read', "Couldn't read the fields on this page.");
    }
  }

  /** Essay questions only, from the resume and sources (never from the applicant details). */
  async function draftEssays() {
    const essays = rows.value.filter((r) => r.source === 'ai');
    if (!essays.length || !page.value) return;
    error.value = '';
    const settings = await getSettings();
    const key = await getApiKey(settings.provider);
    if (!key) return void (error.value = t('sch_add_key', 'Add your API key to start.'));
    const data = await loadCandidateData();
    if (!hasCandidateData(data))
      return void (error.value = t(
        'sch_add_resume',
        'Add your resume so essays have something to draw from.',
      ));
    drafting.value = true;
    try {
      const task = await prepareJobTask();
      if (!task.ok) return void (error.value = task.error);
      const { drafts } = await draftForm({
        provider: task.provider,
        settings,
        model: settings.model,
        candidateBlock: buildSystemBlocks(settings, data)[1]!.text,
        page: page.value,
        fields: essays.map((r) => r.item.field),
        library: await getLibrary(),
        today: todayIso(),
        jobContext: jobPromptText(await getJobContext(page.value.hostname)),
      });
      const byId = new Map(drafts.map((d) => [d.field.targetId, d]));
      rows.value = rows.value.map((r) => {
        const d = r.source === 'ai' ? byId.get(r.item.field.targetId) : undefined;
        return d ? { ...r, value: d.answer, insert: shouldInsertByDefault(d) } : r;
      });
    } catch (err) {
      error.value = jobTaskError(
        err,
        settings,
        t('sch_draft_error', "Couldn't draft the answers. Try again."),
      );
    } finally {
      drafting.value = false;
    }
  }

  async function insertSelected() {
    phase.value = 'inserting';
    for (const row of rows.value) {
      if (!row.insert || !row.value || row.result === 'inserted' || row.result === 'verified')
        continue;
      const f = row.item.field;
      try {
        const result = CHOICE.includes(f.kind)
          ? await toPage<'APPLY_CHOICE'>({
              type: 'APPLY_CHOICE',
              targetId: f.targetId,
              labels: [row.value],
            })
          : await toPage<'INSERT_ANSWER'>({
              type: 'INSERT_ANSWER',
              targetId: f.targetId,
              text: row.value,
              mode: 'replace',
            });
        row.result = result.ok ? 'inserted' : 'failed';
      } catch {
        row.result = 'failed';
      }
    }
    await verify();
    phase.value = 'done';
  }

  /** Read the page again and compare: the value must be exactly what we meant to put there. */
  async function verify() {
    try {
      const again = await toPage<'SCAN_FORM'>({ type: 'SCAN_FORM', max: MAX_FIELDS });
      const byId = new Map(again.fields.map((f) => [f.targetId, f]));
      for (const row of rows.value) {
        if (row.result !== 'inserted') continue;
        const now = byId.get(row.item.field.targetId)?.currentValue ?? '';
        if (norm(now) === norm(row.value)) row.result = 'verified';
        else {
          row.result = 'changed';
          row.pageShows = now;
        }
      }
    } catch {
      // The page navigated or reloaded; the insert results stand.
    }
  }

  const counts = computed(() => {
    const r = rows.value;
    return {
      details: r.filter((x) => x.source === 'details').length,
      ready: r.filter((x) => x.source === 'details' && x.insert).length,
      needs: r.filter((x) => x.source === 'details' && !x.insert && !x.result).length,
      essays: r.filter((x) => x.source === 'ai').length,
      you: r.filter((x) => x.source === 'you').length,
      verified: r.filter((x) => x.result === 'verified').length,
      changed: r.filter((x) => x.result === 'changed' || x.result === 'failed').length,
    };
  });

  function highlight(targetId: string, on: boolean) {
    void toPage<'HIGHLIGHT_FIELD'>({ type: 'HIGHLIGHT_FIELD', targetId, on }).catch(
      () => undefined,
    );
  }

  // Requirements of the saved scholarship or program page.
  const reqStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle');
  const requirements = shallowRef<Requirements | null>(null);
  const reqError = ref('');
  const checklist = ref<string[]>([]);
  const cache = new Map<string, Requirements>();
  const jobKey = computed(() => {
    const j = job.job.value;
    return j ? `${j.hostname}|${j.createdAt}` : '';
  });
  const checklistKey = computed(() => job.job.value?.hostname ?? '');

  watch(
    jobKey,
    async (k) => {
      requirements.value = cache.get(k) ?? null;
      reqStatus.value = requirements.value ? 'done' : 'idle';
      reqError.value = '';
      checklist.value = (await checklistItem.getValue())[checklistKey.value] ?? [];
    },
    { immediate: true },
  );

  async function analyze() {
    const j = job.job.value;
    if (!j) return;
    const k = jobKey.value;
    reqError.value = '';
    const task = await prepareJobTask();
    if (!task.ok) {
      reqStatus.value = 'error';
      reqError.value = task.error;
      return;
    }
    reqStatus.value = 'running';
    try {
      // The full page text, not the short summary: dates and document rules hide in the details.
      const r = await runRequirements({
        provider: task.provider,
        model: task.settings.model,
        pageText: j.text || (jobPromptText(j) ?? ''),
      });
      cache.set(k, r);
      if (jobKey.value !== k) return;
      requirements.value = r;
      reqStatus.value = 'done';
    } catch (err) {
      reqStatus.value = 'error';
      reqError.value = jobTaskError(
        err,
        task.settings,
        t('sch_req_error', "Couldn't read the requirements. Try again."),
      );
    }
  }

  const checks = computed<Check[]>(() =>
    requirements.value && applicant.value
      ? checkEligibility(requirements.value, applicant.value)
      : [],
  );

  async function toggleDocument(name: string) {
    const all = await checklistItem.getValue();
    const set = new Set(all[checklistKey.value] ?? []);
    if (!set.delete(name)) set.add(name);
    checklist.value = [...set];
    await checklistItem.setValue({ ...all, [checklistKey.value]: checklist.value });
  }

  return {
    phase,
    page,
    rows,
    uploads,
    error,
    drafting,
    applicant,
    counts,
    scan,
    draftEssays,
    insertSelected,
    verify,
    highlight,
    reqStatus,
    requirements,
    reqError,
    checks,
    checklist,
    analyze,
    toggleDocument,
  };
}
