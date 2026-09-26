<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IdKey } from '@/kb/identityFill';
import { italyGuide } from '@/kb/italyGuide';
import type { Check } from '@/kb/eligibility';
import { t } from '@/ui/i18n';
import Icon from '@/ui/AppIcon.vue';
import type { useJob } from './useJob';
import type { Row, useScholarship } from './useScholarship';

const props = defineProps<{
  state: ReturnType<typeof useScholarship>;
  job: ReturnType<typeof useJob>;
}>();
const emit = defineEmits<{ openSettings: [section?: string] }>();
const sc = props.state;

type View = 'fill' | 'requirements' | 'guide';
const view = ref<View>('fill');
const VIEWS = computed<{ id: View; label: string }[]>(() => [
  { id: 'fill', label: t('sch_view_fill', 'Fill') },
  { id: 'requirements', label: t('sch_view_requirements', 'Requirements') },
  { id: 'guide', label: t('sch_view_guide', 'Italy guide') },
]);

const KEY_LABELS = computed<Record<IdKey, string>>(() => ({
  givenNames: t('sch_key_given', 'Given names'),
  familyName: t('sch_key_family', 'Family name'),
  fullName: t('sch_key_full', 'Full name'),
  sex: t('sch_key_sex', 'Sex'),
  birthDate: t('sch_key_birth_date', 'Date of birth'),
  birthCity: t('sch_key_birth_city', 'City of birth'),
  birthCountry: t('sch_key_birth_country', 'Country of birth'),
  citizenship: t('sch_key_citizenship', 'Citizenship'),
  secondCitizenship: t('sch_key_second_citizenship', 'Second citizenship'),
  maritalStatus: t('sch_key_marital', 'Marital status'),
  fatherName: t('sch_key_father', "Father's name"),
  motherName: t('sch_key_mother', "Mother's name"),
  nativeLanguage: t('sch_key_native', 'Native language'),
  passportNumber: t('sch_key_passport', 'Passport number'),
  passportIssueDate: t('sch_key_issue', 'Passport issue date'),
  passportExpiryDate: t('sch_key_expiry', 'Passport expiry date'),
  passportIssuingCountry: t('sch_key_issuing_country', 'Passport issuing country'),
  passportIssuingAuthority: t('sch_key_authority', 'Passport issuing authority'),
  nationalId: t('sch_key_national_id', 'National ID number'),
  codiceFiscale: t('sch_key_cf', 'Codice fiscale'),
  email: t('sch_key_email', 'Email'),
  phone: t('sch_key_phone', 'Phone'),
  phoneCountryCode: t('sch_key_phone_code', 'Phone country code'),
  phoneNational: t('sch_key_phone_national', 'Phone number'),
  street: t('sch_key_street', 'Street'),
  houseNumber: t('sch_key_house', 'House number'),
  city: t('sch_key_city', 'City'),
  region: t('sch_key_region', 'Region or province'),
  postalCode: t('sch_key_postal', 'Postal code'),
  country: t('sch_key_country', 'Country'),
  institution: t('sch_key_institution', 'University'),
  degree: t('sch_key_degree', 'Degree'),
  fieldOfStudy: t('sch_key_field', 'Field of study'),
  graduationDate: t('sch_key_graduation', 'Graduation date'),
  grade: t('sch_key_grade', 'Final grade'),
  gradeScale: t('sch_key_scale', 'Grading scale'),
  eduCountry: t('sch_key_edu_country', 'Country of study'),
  age: t('sch_key_age', 'Age'),
  documentType: t('sch_key_doc_type', 'Document type'),
  domicileSame: t('sch_key_domicile_same', 'Current address same as residence'),
  noCodiceFiscale: t('sch_key_no_cf', 'No Italian tax code'),
}));

function issueText(code: string): string {
  switch (code) {
    case 'missing':
      return t('sch_issue_missing', 'Not in your details yet.');
    case 'no-option':
      return t('sch_issue_no_option', "None of the page's options match your details.");
    case 'too-long':
      return t('sch_issue_too_long', 'Longer than this field allows.');
    case 'pattern':
      return t('sch_issue_pattern', 'The page expects a different format.');
    case 'guessed-format':
      return t('sch_issue_guessed', 'Date format guessed from the page language: check it.');
    default:
      return code;
  }
}

const detailRows = computed(() => sc.rows.value.filter((r) => r.source === 'details'));
const essayRows = computed(() => sc.rows.value.filter((r) => r.source === 'ai'));
const youRows = computed(() => sc.rows.value.filter((r) => r.source === 'you'));
const selected = computed(() => sc.rows.value.filter((r) => r.insert && r.value).length);
const busy = computed(() => sc.phase.value === 'scanning' || sc.phase.value === 'inserting');
const CHOICE = ['select', 'radio-group', 'checkbox-group'];

const details = computed(() => {
  const a = sc.applicant.value;
  if (!a) return 0;
  const f = [
    a.givenNames,
    a.familyName,
    a.sex,
    a.birthDate,
    a.birthCountry,
    a.citizenship,
    a.passport.number,
    a.passport.expiryDate,
    a.email,
    a.phoneNumber,
    a.residence.street,
    a.residence.country,
  ];
  return Math.round((f.filter(Boolean).length / f.length) * 100);
});

const PARTS = computed(() => ({
  day: t('sch_part_day', 'day'),
  month: t('sch_part_month', 'month'),
  year: t('sch_part_year', 'year'),
}));

function keyLabel(r: Row): string {
  const c = r.item.classification;
  if (!c) return '';
  return c.part ? `${KEY_LABELS.value[c.key]} (${PARTS.value[c.part]})` : KEY_LABELS.value[c.key];
}

function fieldName(r: Row) {
  return r.item.field.label || r.item.field.placeholder || r.item.field.name || '';
}

function checkText(c: Check): string {
  const d = c.data;
  switch (c.kind) {
    case 'age':
      return d.age === ''
        ? t('sch_check_age_unknown', 'Age limit $1: add your birth date to check.', String(d.max))
        : t(
            'sch_check_age',
            'Age limit $1: you will be $2 on $3.',
            String(d.max),
            String(d.age),
            String(d.on),
          );
    case 'born-after':
      return t('sch_check_born_after', 'Must be born on or after $1.', String(d.date));
    case 'language':
      return d.yours
        ? t('sch_check_lang', '$1 required; yours: $2.', String(d.test), String(d.yours))
        : t(
            'sch_check_lang_unknown',
            '$1 required; add your test in Applicant details.',
            String(d.test),
          );
    case 'passport':
      return d.expiry
        ? t(
            'sch_check_passport',
            'Passport valid until $1 ($2 months after the last deadline).',
            String(d.expiry),
            String(d.months),
          )
        : t(
            'sch_check_passport_unknown',
            'Add your passport expiry date to check it covers your stay.',
          );
    case 'deadline':
      return Number(d.days) >= 0
        ? t(
            'sch_check_deadline',
            '$1: $2, in $3 days.',
            String(d.what),
            String(d.date),
            String(d.days),
          )
        : t('sch_check_deadline_past', '$1: $2, already passed.', String(d.what), String(d.date));
  }
}
const CHECK_ICON = { ok: 'check', fail: 'alert', unknown: 'flag' } as const;
const CHECK_TONE = {
  ok: 'text-success',
  fail: 'text-carbon-pink-text',
  unknown: 'text-graphite-2',
};
</script>

<template>
  <section class="card flex flex-col gap-2 p-4" data-testid="scholarship">
    <div class="flex items-center gap-2.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
        <Icon name="cap" :size="18" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-[15px] leading-tight font-[650]">
          {{ t('sch_title', 'Scholarships and admissions') }}
        </h2>
        <p class="text-[12.5px] text-graphite-2">
          {{ t('sch_subtitle', 'Exact personal details, verified after filling.') }}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2 text-[12.5px]" data-testid="sch-details">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-rule" aria-hidden="true">
        <div class="h-full rounded-full bg-success" :style="{ width: `${details}%` }" />
      </div>
      <span class="tabular-nums text-graphite-2">{{
        t('sch_details_pct', 'Your details: $1%', String(details))
      }}</span>
      <button
        class="btn btn-quiet min-h-0 p-0 text-[12.5px]"
        type="button"
        data-testid="sch-edit-details"
        @click="emit('openSettings', 'applicant')"
      >
        {{ t('sch_edit_details', 'Edit') }}
      </button>
    </div>
  </section>

  <div
    class="grid grid-cols-3 gap-1 rounded-[10px] border border-rule bg-paper p-1"
    role="group"
    :aria-label="t('sch_views', 'Scholarship tools')"
  >
    <button
      v-for="v in VIEWS"
      :key="v.id"
      type="button"
      class="rounded-[8px] py-1.5 text-[12px] font-medium transition-colors"
      :class="view === v.id ? 'bg-ink-soft text-ink' : 'text-graphite-2 hover:text-graphite'"
      :aria-pressed="view === v.id"
      @click="view = v.id"
    >
      {{ v.label }}
    </button>
  </div>

  <!-- Fill -->
  <template v-if="view === 'fill'">
    <section class="card flex flex-col gap-2 p-4">
      <p class="text-[13px] text-graphite-2">
        {{
          t(
            'sch_fill_intro',
            'Open the application page, then scan it. Your personal details are filled from Applicant details, never guessed and never sent to the AI. Nothing is submitted.',
          )
        }}
      </p>
      <p v-if="sc.error.value" class="notice text-[13px]" role="alert" data-testid="sch-error">
        {{ sc.error.value }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="busy"
          data-testid="sch-scan"
          @click="sc.scan"
        >
          <Icon name="target" />
          {{
            sc.phase.value === 'scanning'
              ? t('sch_scanning', 'Scanning')
              : sc.rows.value.length
                ? t('sch_rescan', 'Scan again')
                : t('sch_scan', 'Scan this page')
          }}
        </button>
        <button
          v-if="sc.rows.value.length"
          class="btn"
          type="button"
          :disabled="busy || !selected"
          data-testid="sch-insert"
          @click="sc.insertSelected"
        >
          <Icon name="insert" />
          {{ t('sch_insert', 'Fill $1 fields', String(selected)) }}
        </button>
      </div>
      <p
        v-if="sc.phase.value === 'done'"
        class="text-[13px]"
        role="status"
        data-testid="sch-summary"
      >
        <span class="text-success">{{
          t('sch_verified', '$1 verified on the page.', String(sc.counts.value.verified))
        }}</span>
        <span v-if="sc.counts.value.changed" class="ml-1 text-carbon-pink-text">
          {{ t('sch_changed', '$1 need a look.', String(sc.counts.value.changed)) }}
        </span>
      </p>
    </section>

    <section
      v-if="detailRows.length"
      class="card flex flex-col gap-2 p-4"
      data-testid="sch-detail-rows"
    >
      <p class="eyebrow">
        {{ t('sch_from_details', 'From your details ($1)', String(detailRows.length)) }}
      </p>
      <ul class="flex flex-col divide-y divide-rule">
        <li
          v-for="r in detailRows"
          :key="r.item.field.targetId"
          class="flex flex-col gap-1 py-2"
          data-testid="sch-row"
          @mouseenter="sc.highlight(r.item.field.targetId, true)"
          @mouseleave="sc.highlight(r.item.field.targetId, false)"
        >
          <label class="flex items-start gap-2">
            <input
              v-model="r.insert"
              type="checkbox"
              class="mt-1"
              :disabled="!r.value"
              :aria-label="t('sch_fill_this', 'Fill this field')"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-[12px] text-graphite-2">
                {{ keyLabel(r) }}
                <span v-if="fieldName(r)"> · {{ fieldName(r) }}</span>
              </span>
              <input
                v-if="r.value && !CHOICE.includes(r.item.field.kind)"
                v-model="r.value"
                class="field-input mt-0.5 w-full px-2 py-1 text-[13.5px]"
                data-testid="sch-value"
              />
              <span
                v-else-if="r.value"
                class="block text-[13.5px] font-medium"
                data-testid="sch-value"
                >{{ r.value }}</span
              >
            </span>
            <span
              v-if="r.result === 'verified'"
              class="mt-1 text-success"
              data-testid="sch-verified"
            >
              <Icon name="check" :size="16" />
              <span class="sr-only">{{ t('sch_row_verified', 'Verified on the page') }}</span>
            </span>
            <Icon
              v-else-if="r.result === 'changed' || r.result === 'failed'"
              name="alert"
              :size="16"
              class="mt-1 text-carbon-pink-text"
            />
          </label>
          <p
            v-for="code in r.item.fill?.issues ?? []"
            :key="code"
            class="ml-6 text-[12px] text-carbon-pink-text"
          >
            {{ issueText(code) }}
            <button
              v-if="code === 'missing'"
              class="btn btn-quiet min-h-0 p-0 text-[12px]"
              type="button"
              @click="emit('openSettings', 'applicant')"
            >
              {{ t('sch_add_it', 'Add it') }}
            </button>
          </p>
          <p
            v-if="
              r.item.classification?.confidence === 'likely' &&
              r.value &&
              !r.item.fill?.issues.length
            "
            class="ml-6 text-[12px] text-graphite-2"
          >
            {{ t('sch_likely', 'Matched from the label and its neighbors: glance at it.') }}
          </p>
          <p v-if="r.item.field.currentValue && !r.result" class="ml-6 text-[12px] text-graphite-2">
            {{ t('sch_already', 'Already filled on the page: $1', r.item.field.currentValue) }}
          </p>
          <p v-if="r.result === 'changed'" class="ml-6 text-[12px] text-carbon-pink-text">
            {{
              t(
                'sch_page_shows',
                'The page now shows "$1". Fix it by hand or edit and fill again.',
                r.pageShows ?? '',
              )
            }}
          </p>
          <p v-if="r.result === 'failed'" class="ml-6 text-[12px] text-carbon-pink-text">
            {{ t('sch_failed', "Couldn't fill this field. Copy the value and paste it.") }}
          </p>
        </li>
      </ul>
    </section>

    <section v-if="essayRows.length" class="card flex flex-col gap-2 p-4" data-testid="sch-essays">
      <div class="flex items-center justify-between gap-2">
        <p class="eyebrow">
          {{ t('sch_essays', 'Essay questions ($1)', String(essayRows.length)) }}
        </p>
        <button
          class="btn min-h-0 py-1 text-[13px]"
          type="button"
          :disabled="sc.drafting.value"
          data-testid="sch-draft"
          @click="sc.draftEssays"
        >
          <Icon name="sparkle" :size="14" />
          {{
            sc.drafting.value
              ? t('sch_drafting', 'Drafting')
              : t('sch_draft', 'Draft from my profile')
          }}
        </button>
      </div>
      <ul class="flex flex-col gap-3">
        <li v-for="r in essayRows" :key="r.item.field.targetId" class="flex flex-col gap-1">
          <label class="flex items-start gap-2">
            <input
              v-model="r.insert"
              type="checkbox"
              class="mt-1"
              :disabled="!r.value"
              :aria-label="t('sch_fill_this', 'Fill this field')"
            />
            <span class="text-[13px] font-medium">{{ fieldName(r) }}</span>
            <Icon
              v-if="r.result === 'verified'"
              name="check"
              :size="16"
              class="ml-auto text-success"
            />
          </label>
          <textarea
            v-if="r.value"
            v-model="r.value"
            rows="4"
            class="field-input ml-6 px-2 py-1.5 text-[13px]"
          />
        </li>
      </ul>
    </section>

    <section v-if="youRows.length" class="card flex flex-col gap-2 p-4" data-testid="sch-you">
      <p class="eyebrow">
        {{ t('sch_for_you', 'For you to answer ($1)', String(youRows.length)) }}
      </p>
      <p class="text-[12.5px] text-graphite-2">
        {{
          t(
            'sch_for_you_why',
            "Not in your details, or not something to guess (other people's details, choices about the programme). They stay empty.",
          )
        }}
      </p>
      <ul class="flex flex-col gap-1 text-[13px]">
        <li
          v-for="r in youRows"
          :key="r.item.field.targetId"
          class="flex items-center gap-2"
          @mouseenter="sc.highlight(r.item.field.targetId, true)"
          @mouseleave="sc.highlight(r.item.field.targetId, false)"
        >
          <Icon
            :name="r.item.personal ? 'shield' : 'pen'"
            :size="14"
            class="shrink-0 text-graphite-2"
          />
          {{ fieldName(r) }}
        </li>
      </ul>
    </section>

    <section
      v-if="sc.uploads.value.length"
      class="card flex flex-col gap-2 p-4"
      data-testid="sch-uploads"
    >
      <p class="eyebrow">
        {{ t('sch_uploads', 'Uploads on this page ($1)', String(sc.uploads.value.length)) }}
      </p>
      <p class="text-[12.5px] text-graphite-2">
        {{ t('sch_uploads_why', 'Browsers only let you attach files yourself. Have these ready:') }}
      </p>
      <ul class="flex flex-col gap-1 text-[13px]">
        <li v-for="(u, i) in sc.uploads.value" :key="i" class="flex items-center gap-2">
          <Icon name="file" :size="14" class="shrink-0 text-graphite-2" />
          <span>{{ u.label }}</span>
          <span v-if="u.accept" class="text-[12px] text-graphite-2">({{ u.accept }})</span>
          <span v-if="u.required" class="text-[12px] text-carbon-pink-text">{{
            t('sch_required', 'required')
          }}</span>
        </li>
      </ul>
    </section>
  </template>

  <!-- Requirements -->
  <template v-else-if="view === 'requirements'">
    <section
      v-if="!props.job.job.value"
      class="card flex flex-col items-center gap-2 px-5 py-7 text-center"
      data-testid="sch-req-needs-page"
    >
      <Icon name="cap" :size="22" class="text-ink" />
      <h2 class="text-[15px] font-[650]">
        {{ t('sch_req_save_page', 'Save the call or programme page first') }}
      </h2>
      <p class="text-[13px] text-graphite-2">
        {{
          t(
            'sch_req_save_how',
            'Open the scholarship call or the programme page, then use Set job above and read the whole page.',
          )
        }}
      </p>
    </section>
    <template v-else>
      <section class="card flex flex-col gap-2 p-4" data-testid="sch-req">
        <p class="text-[13px] text-graphite-2">
          {{
            t(
              'sch_req_intro',
              'Reads the saved page for deadlines, eligibility, documents, and language minimums, then checks them against your details.',
            )
          }}
        </p>
        <p
          v-if="sc.reqStatus.value === 'running'"
          role="status"
          class="flex items-center gap-2 text-[13px] text-graphite-2"
        >
          <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
          {{ t('sch_req_reading', 'Reading the requirements…') }}
        </p>
        <p v-if="sc.reqError.value" class="notice text-[13px]" role="alert">
          {{ sc.reqError.value }}
        </p>
        <button
          class="btn self-start"
          :class="sc.requirements.value ? '' : 'btn-primary'"
          type="button"
          :disabled="sc.reqStatus.value === 'running'"
          data-testid="sch-req-run"
          @click="sc.analyze"
        >
          <Icon :name="sc.requirements.value ? 'refresh' : 'target'" />
          {{
            sc.requirements.value
              ? t('sch_req_again', 'Read again')
              : t('sch_req_run', 'Read the requirements')
          }}
        </button>
      </section>

      <template v-if="sc.requirements.value && sc.reqStatus.value !== 'running'">
        <section class="card flex flex-col gap-2 p-4">
          <p class="font-medium" data-testid="sch-req-program">
            {{ sc.requirements.value.program
            }}<span v-if="sc.requirements.value.institution" class="text-graphite-2">
              · {{ sc.requirements.value.institution }}</span
            >
          </p>
          <ul class="flex flex-col gap-1.5" data-testid="sch-checks">
            <li
              v-for="(c, i) in sc.checks.value"
              :key="i"
              class="flex items-start gap-2 text-[13px]"
            >
              <Icon
                :name="CHECK_ICON[c.state]"
                :size="15"
                class="mt-0.5 shrink-0"
                :class="CHECK_TONE[c.state]"
              />
              <span>{{ checkText(c) }}</span>
            </li>
          </ul>
          <ul
            v-if="sc.requirements.value.warnings.length"
            class="notice flex flex-col gap-1 text-[13px]"
          >
            <li v-for="w in sc.requirements.value.warnings" :key="w">{{ w }}</li>
          </ul>
        </section>

        <section
          v-if="sc.requirements.value.eligibility.length"
          class="card flex flex-col gap-2 p-4"
        >
          <p class="eyebrow">{{ t('sch_req_eligibility', 'Who can apply') }}</p>
          <ul class="flex list-disc flex-col gap-1 pl-5 text-[13px]">
            <li v-for="e in sc.requirements.value.eligibility" :key="e.criterion">
              {{ e.criterion }}
            </li>
          </ul>
        </section>

        <section
          v-if="sc.requirements.value.documents.length"
          class="card flex flex-col gap-2 p-4"
          data-testid="sch-docs"
        >
          <p class="eyebrow">
            {{
              t(
                'sch_req_documents',
                'Documents ($1 of $2 ready)',
                String(
                  sc.requirements.value.documents.filter((d) => sc.checklist.value.includes(d.name))
                    .length,
                ),
                String(sc.requirements.value.documents.length),
              )
            }}
          </p>
          <ul class="flex flex-col gap-2">
            <li v-for="d in sc.requirements.value.documents" :key="d.name">
              <label class="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  class="mt-1"
                  :checked="sc.checklist.value.includes(d.name)"
                  @change="sc.toggleDocument(d.name)"
                />
                <span>
                  <span class="font-medium">{{ d.name }}</span>
                  <span v-if="!d.required" class="text-[12px] text-graphite-2">
                    ({{ t('sch_optional', 'optional') }})</span
                  >
                  <span v-if="d.details" class="block text-[12.5px] text-graphite-2">{{
                    d.details
                  }}</span>
                </span>
              </label>
            </li>
          </ul>
        </section>

        <section
          v-if="sc.requirements.value.steps.length || sc.requirements.value.fees.length"
          class="card flex flex-col gap-2 p-4"
        >
          <p class="eyebrow">{{ t('sch_req_steps', 'Steps and fees') }}</p>
          <ol class="flex list-decimal flex-col gap-1 pl-5 text-[13px]">
            <li v-for="s in sc.requirements.value.steps" :key="s">{{ s }}</li>
          </ol>
          <ul v-if="sc.requirements.value.fees.length" class="flex flex-col gap-1 text-[13px]">
            <li v-for="f in sc.requirements.value.fees" :key="f.what">
              {{ f.what }}: <span class="font-medium">{{ f.amount }}</span>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </template>

  <!-- Italy guide -->
  <template v-else>
    <p class="text-[12.5px] text-graphite-2">
      {{
        t(
          'sch_guide_intro',
          "From the portals' own guides (September 2026). Rules change every year: the current call always wins.",
        )
      }}
    </p>
    <section
      v-for="g in italyGuide()"
      :key="g.title"
      class="card flex flex-col gap-1.5 p-4"
      data-testid="sch-guide"
    >
      <p class="font-medium">{{ g.title }}</p>
      <ul class="flex list-disc flex-col gap-1 pl-5 text-[13px]">
        <li v-for="p in g.points" :key="p">{{ p }}</li>
      </ul>
      <a
        :href="g.source"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[12px] text-ink underline-offset-2 hover:underline"
      >
        {{ g.source.replace('https://', '') }}
      </a>
    </section>
  </template>
</template>
