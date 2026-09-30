<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { NO_DEALBREAKERS, type Dealbreakers } from '@/kb/dealbreakers';
import { getSettings, saveSettings } from '@/storage/items';

// "Should I apply?": the candidate's dealbreakers, checked in code (no AI) when they tailor for
// a job. Every rule is off until set.

const d = ref<Dealbreakers>({ ...NO_DEALBREAKERS });
const saved = ref(false);
onMounted(async () => {
  d.value = { ...(await getSettings()).dealbreakers };
});

const list = (v: string[]) => v.join(', ');
const parse = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);

let timer = 0;
async function save(patch: Partial<Dealbreakers>) {
  d.value = { ...d.value, ...patch };
  // A JSON copy: structuredClone throws on Vue's reactive arrays.
  await saveSettings({ dealbreakers: JSON.parse(JSON.stringify(d.value)) as Dealbreakers });
  saved.value = true;
  clearTimeout(timer);
  timer = window.setTimeout(() => (saved.value = false), 1500);
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'ETB', 'KES', 'NGN', 'ZAR'];
const value = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
</script>

<template>
  <section class="card flex flex-col gap-3 p-4" data-testid="dealbreakers">
    <div>
      <h3 class="font-[650]">Dealbreakers</h3>
      <p class="text-[13px] text-graphite-2">
        Checked when you tailor your resume for a job, before anything is sent to the AI. A job that
        hits one asks you first. Leave a box empty to skip that check.
      </p>
    </div>

    <label class="flex flex-col gap-1">
      <span>Countries or regions you can work in</span>
      <input
        class="field-input px-2 py-1.5"
        placeholder="Portugal, EU"
        :value="list(d.places)"
        data-testid="db-places"
        @change="save({ places: parse(value($event)) })"
      />
      <span class="text-[12.5px] text-graphite-2">
        Jobs elsewhere are flagged, remote ones too when they're limited to a country (LinkedIn
        marks applicants from outside it "Not a fit").
      </span>
    </label>

    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="d.remoteOnly"
        data-testid="db-remote"
        @change="save({ remoteOnly: checked($event) })"
      />
      <span>Remote jobs only</span>
    </label>
    <label class="flex items-start gap-2">
      <input
        type="checkbox"
        class="mt-1"
        :checked="d.needsSponsorship"
        data-testid="db-sponsorship"
        @change="save({ needsSponsorship: checked($event) })"
      />
      <span>I need visa sponsorship</span>
    </label>

    <div class="flex flex-col gap-1">
      <span id="db-pay-label">Lowest pay worth applying for</span>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="db-pay-label">
        <input
          class="field-input w-36 px-2 py-1.5"
          type="number"
          min="0"
          aria-label="Amount"
          :value="d.minPay || ''"
          placeholder="None"
          data-testid="db-pay"
          @change="save({ minPay: Math.max(0, Number(value($event)) || 0) })"
        />
        <select
          class="field-input w-auto px-2 py-1.5"
          aria-label="Currency"
          :value="d.currency"
          @change="save({ currency: value($event) })"
        >
          <option v-for="c in CURRENCIES" :key="c">{{ c }}</option>
        </select>
        <select
          class="field-input w-auto px-2 py-1.5"
          aria-label="Per"
          :value="d.period"
          @change="save({ period: value($event) as Dealbreakers['period'] })"
        >
          <option value="year">a year</option>
          <option value="month">a month</option>
          <option value="hour">an hour</option>
        </select>
      </div>
      <span class="text-[12.5px] text-graphite-2">
        Compared only with pay in the same currency. An hourly rate counts as 2,080 hours a year.
      </span>
    </div>

    <label class="flex flex-col gap-1">
      <span>Words in a job title to skip</span>
      <input
        class="field-input px-2 py-1.5"
        placeholder="Principal, Intern"
        :value="list(d.titleWords)"
        data-testid="db-titles"
        @change="save({ titleWords: parse(value($event)) })"
      />
    </label>
    <label class="flex flex-col gap-1">
      <span>Companies to skip</span>
      <input
        class="field-input px-2 py-1.5"
        :value="list(d.companies)"
        data-testid="db-companies"
        @change="save({ companies: parse(value($event)) })"
      />
    </label>
    <label class="flex flex-col gap-1">
      <span>Words in the post to skip</span>
      <input
        class="field-input px-2 py-1.5"
        placeholder="security clearance, on-call"
        :value="list(d.avoidWords)"
        data-testid="db-words"
        @change="save({ avoidWords: parse(value($event)) })"
      />
    </label>
    <p role="status" class="text-[12.5px] text-graphite-2">{{ saved ? 'Saved' : '' }}</p>
  </section>
</template>
