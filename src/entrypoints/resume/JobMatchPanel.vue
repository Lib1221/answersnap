<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { updateApplication } from '@/kb/applications';
import { checkDealbreakers } from '@/kb/dealbreakers';
import { resumeChanges, undoChange, wordDiff, type Change } from '@/kb/resume/diff';
import { getSettings } from '@/storage/items';
import type { Resume } from '@/kb/resume/model';
import { addSkill, removeAssumed, resumeText } from '@/kb/resume/tailorApply';
import { matchKeywords, type Assumed, type Keyword } from '@/kb/resume/tailoring';
import { plainText, safeUrl } from '@/kb/richText';
import Icon from '@/ui/AppIcon.vue';

// "Job match" for a resume tailored to one job: how well it matches the job's keywords now, what
// could rule the candidate out, every addition to check, and the cover letter.

const props = defineProps<{
  resume: Resume;
  letterState: 'idle' | 'writing' | 'error';
  letterError: string;
  showing: 'resume' | 'letter';
  /** The master resume the copy was made from, for "What changed" (null when it's gone). */
  master: Resume | null;
}>();
const emit = defineEmits<{
  update: [resume: Resume];
  writeLetter: [];
  show: [doc: 'resume' | 'letter'];
  download: [doc: 'resume' | 'letter'];
}>();

const tl = computed(() => props.resume.tailoring!);
const match = computed(() => matchKeywords(resumeText(props.resume), tl.value.keywords));
const found = (k: Keyword) => match.value.found.includes(k);
const must = computed(() => tl.value.keywords.filter((k) => k.importance === 'must'));
const nice = computed(() => tl.value.keywords.filter((k) => k.importance === 'nice'));
const jobUrl = computed(() => safeUrl(tl.value.job.url));
const applied = ref(false);

const changes = computed(() => (props.master ? resumeChanges(props.master, props.resume) : []));
const KIND: Record<Change['kind'], string> = {
  headline: 'Reworded',
  summary: 'Rewritten',
  'line-changed': 'Reworded',
  'line-added': 'Added',
  'line-removed': 'Cut',
  hidden: 'Left out',
  order: 'Reordered',
};
const pieces = (c: Change) => wordDiff(plainText(c.before), plainText(c.after));
function undo(c: Change) {
  if (props.master) emit('update', undoChange(props.resume, props.master, c));
}
/** The candidate's dealbreakers this job hits, with the settings as they are now. */
const hits = ref<string[]>([]);
onMounted(async () => {
  hits.value = checkDealbreakers(tl.value.job, (await getSettings()).dealbreakers).hits;
});

function add(k: Keyword) {
  emit('update', addSkill(props.resume, k.term));
}
function remove(a: Assumed) {
  emit('update', removeAssumed(props.resume, a));
}
function keep(a: Assumed) {
  emit('update', {
    ...props.resume,
    tailoring: { ...tl.value, assumed: tl.value.assumed.filter((x) => x.id !== a.id) },
  });
}
function setLetter(field: 'text' | 'recipient' | 'date', value: string) {
  const cur = props.resume.coverLetter ?? { text: '', recipient: '', date: '', updatedAt: '' };
  emit('update', {
    ...props.resume,
    coverLetter: { ...cur, [field]: value, updatedAt: new Date().toISOString() },
  });
}
async function markApplied() {
  if (!tl.value.applicationId) return;
  await updateApplication(tl.value.applicationId, { status: 'applied' });
  applied.value = true;
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="job-match">
    <section class="card flex flex-col gap-1 p-4">
      <p class="eyebrow">Tailored for</p>
      <h2 class="text-[16px] leading-snug font-[650]" data-testid="match-job">
        {{ tl.job.title || 'This job'
        }}<span v-if="tl.job.company" class="font-normal"> at {{ tl.job.company }}</span>
      </h2>
      <p v-if="tl.job.location || tl.job.workplace" class="text-[13px] text-graphite-2">
        {{ [tl.job.location, tl.job.workplace].filter(Boolean).join(' · ') }}
      </p>
      <a
        v-if="jobUrl"
        :href="jobUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="self-start text-[13px] text-ink underline"
        >Open the job post</a
      >
    </section>

    <section
      v-if="tl.eligibility.length || hits.length"
      class="card flex flex-col gap-2 p-4"
      aria-labelledby="elig-h"
    >
      <h3 id="elig-h" class="text-[14px] font-semibold">Check before you apply</h3>
      <p class="text-[12.5px] text-graphite-2">
        These can reject an application whatever the resume says.
      </p>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="(h, i) in hits"
          :key="`d${i}`"
          class="notice rounded-control px-2.5 py-1.5 text-[13px]"
          data-testid="dealbreaker-item"
        >
          Your dealbreaker: {{ h }}
        </li>
        <li
          v-for="(e, i) in tl.eligibility"
          :key="i"
          class="rounded-control px-2.5 py-1.5 text-[13px]"
          :class="e.level === 'block' ? 'notice' : 'bg-surface'"
          data-testid="eligibility-item"
        >
          {{ e.text }}
        </li>
      </ul>
    </section>

    <section class="card flex flex-col gap-3 p-4" aria-labelledby="ats-h">
      <div class="flex items-baseline justify-between gap-3">
        <h3 id="ats-h" class="text-[14px] font-semibold">Keyword match</h3>
        <p class="text-[13px] text-graphite-2 tabular-nums">
          <span data-testid="match-before">{{ tl.scoreBefore }}%</span> before
          <span aria-hidden="true">→</span>
          <strong class="text-[18px] text-ink" data-testid="match-now">{{ match.score }}%</strong>
          now
        </p>
      </div>
      <div
        class="h-2 overflow-hidden rounded-full bg-surface"
        role="img"
        :aria-label="`Keyword match ${match.score} percent`"
      >
        <div class="h-full rounded-full bg-ink" :style="{ width: `${match.score}%` }" />
      </div>
      <p class="text-[13px]" data-testid="match-musts">
        <strong class="tabular-nums">{{ match.mustFound }} of {{ match.mustTotal }}</strong>
        must-haves are in your resume.
      </p>
      <p class="text-[12.5px] text-graphite-2">
        The job's keywords an applicant tracking system and a recruiter search for. Must-haves weigh
        70% of the score.
      </p>
      <div
        v-for="group in [
          { name: 'Must-have', list: must },
          { name: 'Nice to have', list: nice },
        ]"
        :key="group.name"
      >
        <template v-if="group.list.length">
          <p class="mb-1.5 text-[12.5px] font-medium">{{ group.name }}</p>
          <ul class="flex flex-wrap gap-1.5">
            <li
              v-for="k in group.list"
              :key="k.term"
              class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12.5px]"
              :class="
                found(k)
                  ? 'border-ink/30 bg-ink-soft text-ink'
                  : 'border-rule border-dashed text-graphite-2'
              "
              :data-testid="found(k) ? 'kw-found' : 'kw-missing'"
            >
              <Icon v-if="found(k)" name="check" :size="12" />
              {{ k.term }}
              <button
                v-if="!found(k)"
                type="button"
                class="ml-0.5 rounded-full px-1 text-[12px] font-medium text-ink hover:bg-ink-soft"
                :aria-label="`Add ${k.term} to your skills`"
                :title="`Add ${k.term} to your skills`"
                data-testid="kw-add"
                @click="add(k)"
              >
                + Add
              </button>
            </li>
          </ul>
        </template>
      </div>
    </section>

    <section class="card flex flex-col gap-2 p-4" aria-labelledby="review-h">
      <h3 id="review-h" class="text-[14px] font-semibold">
        Check these are true
        <span class="font-normal text-graphite-2 tabular-nums">({{ tl.assumed.length }})</span>
      </h3>
      <p v-if="!tl.assumed.length" class="text-[13px] text-graphite-2" data-testid="assumed-none">
        Nothing was added beyond your resume and profile.
      </p>
      <template v-else>
        <p class="text-[12.5px] text-graphite-2">
          Added for this job but not in your resume or profile. Remove anything that isn't true:
          you'll be asked about it in the interview.
        </p>
        <ul class="flex flex-col gap-2">
          <li
            v-for="a in tl.assumed"
            :key="a.id"
            class="flex flex-col gap-1.5 rounded-control border border-rule px-2.5 py-2"
            data-testid="assumed-item"
          >
            <span class="text-[13px]">{{ a.text }}</span>
            <span class="text-[12px] text-graphite-2">{{ a.where }}</span>
            <span class="flex gap-1.5">
              <button
                v-if="a.kind !== 'claim'"
                type="button"
                class="btn min-h-7 px-2 text-[12.5px]"
                data-testid="assumed-remove"
                @click="remove(a)"
              >
                Remove
              </button>
              <button
                type="button"
                class="btn btn-quiet min-h-7 px-2 text-[12.5px]"
                data-testid="assumed-keep"
                @click="keep(a)"
              >
                {{ a.kind === 'claim' ? 'Got it' : "It's true, keep it" }}
              </button>
            </span>
          </li>
        </ul>
      </template>
      <details v-if="tl.trimmed.length" class="text-[12.5px] text-graphite-2">
        <summary class="cursor-pointer">Left out ({{ tl.trimmed.length }})</summary>
        <ul class="mt-1.5 flex list-disc flex-col gap-1 pl-5" data-testid="trimmed">
          <li v-for="(x, i) in tl.trimmed" :key="i">{{ x }}</li>
        </ul>
        <p class="mt-1.5">Everything left out is still in your master resume.</p>
      </details>
    </section>

    <section class="card flex flex-col gap-2 p-4" aria-labelledby="changes-h">
      <h3 id="changes-h" class="text-[14px] font-semibold">
        What changed
        <span class="font-normal text-graphite-2 tabular-nums">({{ changes.length }})</span>
      </h3>
      <p v-if="!master" class="text-[13px] text-graphite-2">
        The master resume this copy was made from is gone, so there's nothing to compare.
      </p>
      <p v-else-if="!changes.length" class="text-[13px] text-graphite-2" data-testid="changes-none">
        This copy is the same as your master resume.
      </p>
      <details v-else open class="flex flex-col gap-2">
        <summary class="cursor-pointer text-[12.5px] text-graphite-2">
          Every difference from your master resume. Undo puts your own version back.
        </summary>
        <ul class="mt-2 flex flex-col gap-2">
          <li
            v-for="c in changes"
            :key="c.id"
            class="flex flex-col gap-1 rounded-control border border-rule px-2.5 py-2"
            data-testid="change-item"
          >
            <span class="flex items-baseline justify-between gap-2 text-[12px] text-graphite-2">
              <span>{{ c.where }}</span>
              <span class="shrink-0 font-medium">{{ KIND[c.kind] }}</span>
            </span>
            <p v-if="c.kind === 'order'" class="text-[13px]">
              Put the most relevant first. Undo restores your order.
            </p>
            <p v-else-if="c.kind === 'hidden'" class="text-[13px]">
              {{ plainText(c.before) }} is left out of this copy.
            </p>
            <p v-else class="text-[13px] leading-snug" data-testid="change-diff">
              <template v-for="(p, i) in pieces(c)" :key="i">
                <del
                  v-if="p.kind === 'del'"
                  class="me-[3px] rounded-[3px] bg-carbon-pink text-carbon-pink-text"
                  >{{ p.text }}</del
                ><ins
                  v-else-if="p.kind === 'ins'"
                  class="rounded-[3px] bg-success-soft text-success no-underline"
                  >{{ p.text }}</ins
                ><span v-else>{{ p.text }}</span>
              </template>
            </p>
            <button
              type="button"
              class="btn btn-quiet min-h-7 self-start px-2 text-[12.5px]"
              data-testid="change-undo"
              @click="undo(c)"
            >
              Undo
            </button>
          </li>
        </ul>
      </details>
    </section>

    <section class="card flex flex-col gap-2.5 p-4" aria-labelledby="letter-h">
      <div class="flex items-center justify-between gap-2">
        <h3 id="letter-h" class="text-[14px] font-semibold">Cover letter</h3>
        <button
          v-if="resume.coverLetter?.text"
          type="button"
          class="btn btn-quiet min-h-7 px-2 text-[12.5px]"
          :aria-pressed="showing === 'letter'"
          data-testid="show-letter"
          @click="emit('show', showing === 'letter' ? 'resume' : 'letter')"
        >
          {{ showing === 'letter' ? 'Show the resume' : 'Show the letter' }}
        </button>
      </div>
      <p
        v-if="letterState === 'writing'"
        class="text-[13px] text-graphite-2"
        role="status"
        data-testid="letter-writing"
      >
        Writing your cover letter…
      </p>
      <p v-else-if="letterState === 'error'" class="notice text-[13px]" role="alert">
        {{ letterError }}
      </p>
      <template v-if="resume.coverLetter">
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12.5px] font-medium">
            To
            <input
              class="field-input px-2 py-1 font-normal"
              :value="resume.coverLetter.recipient"
              data-testid="letter-recipient"
              @input="setLetter('recipient', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium">
            Date
            <input
              class="field-input px-2 py-1 font-normal"
              :value="resume.coverLetter.date"
              data-testid="letter-date"
              @input="setLetter('date', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium">
          Letter
          <textarea
            class="field-input min-h-56 px-2.5 py-2 text-[13px] leading-relaxed font-normal"
            :value="resume.coverLetter.text"
            data-testid="letter-text"
            @input="setLetter('text', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
      </template>
      <button
        type="button"
        class="btn self-start text-[13px]"
        :disabled="letterState === 'writing'"
        data-testid="letter-rewrite"
        @click="emit('writeLetter')"
      >
        <Icon name="sparkle" :size="14" />
        {{ resume.coverLetter ? 'Write it again' : 'Write the cover letter' }}
      </button>
    </section>

    <section class="flex flex-col gap-2">
      <button
        type="button"
        class="btn btn-primary"
        data-testid="download-resume"
        @click="emit('download', 'resume')"
      >
        <Icon name="file" /> Download resume PDF
      </button>
      <button
        type="button"
        class="btn"
        :disabled="!resume.coverLetter?.text"
        data-testid="download-letter"
        @click="emit('download', 'letter')"
      >
        <Icon name="file" /> Download cover letter PDF
      </button>
      <button
        v-if="tl.applicationId"
        type="button"
        class="btn btn-quiet"
        :disabled="applied"
        data-testid="mark-applied"
        @click="markApplied"
      >
        {{ applied ? 'Marked as applied' : 'Mark as applied' }}
      </button>
      <p class="text-[12px] text-graphite-2">
        Downloads open the print window: choose Save as PDF as the destination.
      </p>
    </section>
  </div>
</template>
