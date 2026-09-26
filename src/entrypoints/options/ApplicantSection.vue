<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ApplicantSchema,
  EducationSchema,
  LanguageTestSchema,
  getApplicant,
  saveApplicant,
  type Applicant,
} from '@/kb/applicant';
import { checkCodiceFiscale } from '@/kb/codiceFiscale';
import { parseMrz, type MrzResult } from '@/kb/mrz';
import Icon from '@/ui/AppIcon.vue';
import CountrySelect from './CountrySelect.vue';

const a = ref<Applicant | null>(null);
const saved = ref<string>('');
const mrzText = ref('');
const mrz = ref<MrzResult | null>(null);
const mrzError = ref('');
const differentDomicile = ref(false);

onMounted(async () => {
  a.value = await getApplicant();
  const d = a.value.domicile;
  differentDomicile.value = !!(d.street || d.city || d.country);
});

async function save() {
  if (!a.value) return;
  if (!differentDomicile.value)
    a.value.domicile = { street: '', city: '', region: '', postalCode: '', country: '' };
  await saveApplicant(ApplicantSchema.parse(a.value));
  saved.value = 'Saved';
  setTimeout(() => (saved.value = ''), 2000);
}

function readMrz() {
  mrzError.value = '';
  const r = parseMrz(mrzText.value);
  mrz.value = r;
  if (!r) {
    mrzError.value =
      'No passport lines found. Paste the two lines of letters and "<" signs at the bottom of the photo page.';
    return;
  }
  if (!a.value) return;
  // Only fields the passport states; the rest of the details stay as they are.
  a.value.familyName = titleCase(r.familyName);
  a.value.givenNames = titleCase(r.givenNames);
  a.value.birthDate = r.birthDate;
  a.value.sex = r.sex;
  if (r.citizenship) a.value.citizenship = r.citizenship;
  a.value.passport.number = r.passportNumber;
  a.value.passport.expiryDate = r.expiryDate;
  if (r.issuingCountry) a.value.passport.issuingCountry = r.issuingCountry;
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

const cf = computed(() => {
  const code = a.value?.codiceFiscale.trim();
  if (!code || !a.value) return null;
  return checkCodiceFiscale(code, a.value);
});

/** Months left on the passport; study visas need it to outlast the stay. */
const passportMonthsLeft = computed(() => {
  const exp = a.value?.passport.expiryDate;
  if (!exp) return null;
  const ms = Date.parse(exp) - Date.now();
  return Math.floor(ms / (30.44 * 24 * 60 * 60 * 1000));
});

const filled = computed(() => {
  const x = a.value;
  if (!x) return 0;
  const checks = [
    x.givenNames,
    x.familyName,
    x.sex,
    x.birthDate,
    x.birthCity,
    x.birthCountry,
    x.citizenship,
    x.passport.number,
    x.passport.issueDate,
    x.passport.expiryDate,
    x.passport.issuingCountry,
    x.email,
    x.phoneNumber,
    x.residence.street,
    x.residence.city,
    x.residence.country,
    x.education.length ? 'y' : '',
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
});

const LEVELS = [
  ['high-school', 'High school'],
  ['bachelor', "Bachelor's"],
  ['master', "Master's"],
  ['phd', 'PhD'],
  ['other', 'Other'],
] as const;
</script>

<template>
  <section
    v-if="a"
    id="applicant"
    class="flex flex-col gap-6"
    aria-labelledby="applicant-title"
    data-testid="applicant"
  >
    <div>
      <h2 id="applicant-title" class="text-xl font-[650]">Applicant details</h2>
      <p class="text-graphite-2">
        The exact facts scholarship and university forms ask for. The Scholarship tab copies them
        into forms in the format each field expects. They stay on this computer: never sent to the
        AI, never synced.
      </p>
      <p class="mt-2 text-[13px] tabular-nums text-graphite-2" data-testid="applicant-complete">
        {{ filled }}% of the key details filled in.
      </p>
    </div>

    <div class="card flex flex-col gap-2 p-4">
      <h3 class="font-medium">Read my passport</h3>
      <p class="text-[13px] text-graphite-2">
        Type or paste the two lines of letters, digits, and &lt; signs at the bottom of your
        passport's photo page. Every value is checked with the passport's own check digits.
      </p>
      <textarea
        v-model="mrzText"
        rows="2"
        spellcheck="false"
        class="field-input px-3 py-2 font-mono text-[13px] uppercase"
        placeholder="P<ETHTESFAYE<<ABEBE<KEBEDE<<<<<<<<<<<<<<<<<<<&#10;EP12345670ETH9907041M3201143<<<<<<<<<<<<<<04"
        data-testid="mrz-input"
      />
      <button class="btn self-start" type="button" data-testid="mrz-read" @click="readMrz">
        <Icon name="shield" /> Read passport lines
      </button>
      <p v-if="mrzError" class="notice text-[13px]" role="alert">{{ mrzError }}</p>
      <p
        v-else-if="mrz && !mrz.errors.length"
        class="success self-start text-[13px]"
        data-testid="mrz-ok"
      >
        Read and verified: {{ mrz.familyName }} {{ mrz.givenNames }}, passport
        {{ mrz.passportNumber }}. Check the details below, then save.
      </p>
      <p v-else-if="mrz" class="notice text-[13px]" role="alert" data-testid="mrz-bad">
        Read, but these parts fail their check digits, so something is mistyped:
        {{ mrz.errors.join(', ') }}.
      </p>
    </div>

    <fieldset class="card grid grid-cols-2 gap-3 p-4">
      <legend class="px-1 font-medium">You</legend>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Given names (as in passport)
        <input
          v-model="a.givenNames"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-given"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Family name (as in passport)
        <input
          v-model="a.familyName"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-family"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Sex (as in passport)
        <select v-model="a.sex" class="field-input px-2.5 py-1.5 font-normal" data-testid="ap-sex">
          <option value="">Choose</option>
          <option value="F">Female</option>
          <option value="M">Male</option>
          <option value="X">X / other</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Date of birth
        <input
          v-model="a.birthDate"
          type="date"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-dob"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        City of birth
        <input v-model="a.birthCity" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Country of birth
        <CountrySelect v-model="a.birthCountry" testid="ap-birth-country" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Citizenship
        <CountrySelect v-model="a.citizenship" testid="ap-citizenship" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Second citizenship (if any)
        <CountrySelect v-model="a.secondCitizenship" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Marital status
        <select v-model="a.maritalStatus" class="field-input px-2.5 py-1.5 font-normal">
          <option value="">Choose</option>
          <option value="single">Single</option>
          <option value="married">Married</option>
          <option value="divorced">Divorced</option>
          <option value="widowed">Widowed</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Native language
        <input v-model="a.nativeLanguage" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Father's full name
        <input v-model="a.fatherName" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Mother's full name
        <input v-model="a.motherName" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
    </fieldset>

    <fieldset class="card grid grid-cols-2 gap-3 p-4">
      <legend class="px-1 font-medium">Passport</legend>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Passport number
        <input
          v-model="a.passport.number"
          class="field-input px-2.5 py-1.5 font-normal uppercase"
          spellcheck="false"
          data-testid="ap-passport"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Issuing country
        <CountrySelect v-model="a.passport.issuingCountry" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Date of issue
        <input
          v-model="a.passport.issueDate"
          type="date"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-issue"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Date of expiry
        <input
          v-model="a.passport.expiryDate"
          type="date"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-expiry"
        />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        Issuing authority
        <input
          v-model="a.passport.issuingAuthority"
          class="field-input px-2.5 py-1.5 font-normal"
        />
      </label>
      <p
        v-if="passportMonthsLeft !== null && passportMonthsLeft < 18"
        class="notice col-span-2 text-[13px]"
        role="alert"
        data-testid="passport-expiry-warning"
      >
        Your passport has {{ Math.max(0, passportMonthsLeft) }} months left. A study visa and
        residence permit need a passport that stays valid for your whole stay, so check this before
        you apply.
      </p>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        National ID number (if forms ask for it)
        <input v-model="a.nationalId" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
    </fieldset>

    <fieldset class="card flex flex-col gap-2 p-4">
      <legend class="px-1 font-medium">Italy</legend>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Codice fiscale (Italian tax code)
        <input
          v-model="a.codiceFiscale"
          class="field-input max-w-sm px-2.5 py-1.5 font-mono font-normal uppercase"
          maxlength="16"
          spellcheck="false"
          data-testid="ap-cf"
        />
      </label>
      <p class="text-[12.5px] text-graphite-2">
        Italian universities and regional scholarships (DSU) ask for it. Get it from the Italian
        embassy or the Agenzia delle Entrate; copy it exactly.
      </p>
      <p v-if="cf && cf.valid" class="success self-start text-[13px]" data-testid="cf-ok">
        Valid, and it matches your name, birth date, and sex.
      </p>
      <p v-else-if="cf" class="notice text-[13px]" role="alert" data-testid="cf-bad">
        Check it: {{ cf.problems.join('; ') }}.
      </p>
    </fieldset>

    <fieldset class="card grid grid-cols-2 gap-3 p-4">
      <legend class="px-1 font-medium">Contact</legend>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        Email
        <input
          v-model="a.email"
          type="email"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-email"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Phone country
        <CountrySelect v-model="a.phoneCountry" testid="ap-phone-country" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Phone number (without the country code)
        <input
          v-model="a.phoneNumber"
          type="tel"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-phone"
        />
      </label>
    </fieldset>

    <fieldset class="card grid grid-cols-2 gap-3 p-4">
      <legend class="px-1 font-medium">Home address (residence)</legend>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        Street and number
        <input
          v-model="a.residence.street"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-street"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        City
        <input
          v-model="a.residence.city"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="ap-city"
        />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Postal code
        <input v-model="a.residence.postalCode" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        State, region, or province
        <input v-model="a.residence.region" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Country
        <CountrySelect v-model="a.residence.country" testid="ap-country" />
      </label>
      <label class="col-span-2 flex items-center gap-2 text-[13px]">
        <input v-model="differentDomicile" type="checkbox" />
        I live somewhere else right now (Italian forms call this "domicilio")
      </label>
    </fieldset>

    <fieldset v-if="differentDomicile" class="card grid grid-cols-2 gap-3 p-4">
      <legend class="px-1 font-medium">Current address (domicile)</legend>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        Street and number
        <input v-model="a.domicile.street" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        City
        <input v-model="a.domicile.city" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Postal code
        <input v-model="a.domicile.postalCode" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        State, region, or province
        <input v-model="a.domicile.region" class="field-input px-2.5 py-1.5 font-normal" />
      </label>
      <label class="flex flex-col gap-1 text-[13px] font-medium">
        Country
        <CountrySelect v-model="a.domicile.country" />
      </label>
    </fieldset>

    <fieldset class="card flex flex-col gap-3 p-4">
      <legend class="px-1 font-medium">Education</legend>
      <div
        v-for="(e, i) in a.education"
        :key="i"
        class="grid grid-cols-2 gap-3 rounded-control border border-rule p-3"
        data-testid="education-entry"
      >
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Level
          <select v-model="e.level" class="field-input px-2.5 py-1.5 font-normal">
            <option v-for="[v, l] in LEVELS" :key="v" :value="v">{{ l }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Degree title
          <input
            v-model="e.degree"
            class="field-input px-2.5 py-1.5 font-normal"
            placeholder="BSc Computer Science"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Institution
          <input v-model="e.institution" class="field-input px-2.5 py-1.5 font-normal" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Field of study
          <input v-model="e.field" class="field-input px-2.5 py-1.5 font-normal" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          City
          <input v-model="e.city" class="field-input px-2.5 py-1.5 font-normal" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Country
          <CountrySelect v-model="e.country" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Start date
          <input v-model="e.startDate" type="date" class="field-input px-2.5 py-1.5 font-normal" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Graduation date
          <input
            v-model="e.graduationDate"
            type="date"
            class="field-input px-2.5 py-1.5 font-normal"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Final grade or GPA (as on the transcript)
          <input
            v-model="e.grade"
            class="field-input px-2.5 py-1.5 font-normal"
            placeholder="3.6"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Grading scale maximum
          <input
            v-model="e.gradeScale"
            class="field-input px-2.5 py-1.5 font-normal"
            placeholder="4"
          />
        </label>
        <button
          class="btn btn-quiet col-span-2 justify-self-start"
          type="button"
          @click="a.education.splice(i, 1)"
        >
          Remove
        </button>
      </div>
      <button
        class="btn self-start"
        type="button"
        data-testid="add-education"
        @click="a.education.push(EducationSchema.parse({}))"
      >
        Add a degree or diploma
      </button>
    </fieldset>

    <fieldset class="card flex flex-col gap-3 p-4">
      <legend class="px-1 font-medium">Language tests</legend>
      <div
        v-for="(l, i) in a.languageTests"
        :key="i"
        class="grid grid-cols-4 gap-3 rounded-control border border-rule p-3"
      >
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Test
          <input
            v-model="l.test"
            class="field-input px-2.5 py-1.5 font-normal"
            placeholder="IELTS Academic"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Score
          <input
            v-model="l.score"
            class="field-input px-2.5 py-1.5 font-normal"
            placeholder="7.0"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Level
          <input v-model="l.level" class="field-input px-2.5 py-1.5 font-normal" placeholder="C1" />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Date
          <input v-model="l.date" type="date" class="field-input px-2.5 py-1.5 font-normal" />
        </label>
        <button
          class="btn btn-quiet col-span-4 justify-self-start"
          type="button"
          @click="a.languageTests.splice(i, 1)"
        >
          Remove
        </button>
      </div>
      <button
        class="btn self-start"
        type="button"
        @click="a.languageTests.push(LanguageTestSchema.parse({}))"
      >
        Add a language test
      </button>
    </fieldset>

    <div class="flex items-center gap-2">
      <button class="btn btn-primary" type="button" data-testid="applicant-save" @click="save">
        <Icon name="check" /> Save details
      </button>
      <span v-if="saved" class="success text-[13px]" role="status">{{ saved }}</span>
    </div>
  </section>
</template>
