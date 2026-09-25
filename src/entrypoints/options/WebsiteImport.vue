<script setup lang="ts">
import { computed, ref } from 'vue';
import { realTextLength } from '@/kb/normalize';
import {
  fetchLlmsTxt,
  fetchPage,
  fetchPages,
  MIN_SITE_TEXT,
  normalizeUrl,
  originPatterns,
  type ParsedPage,
} from '@/kb/web';
import ReviewText from './ReviewText.vue';
import { newSource, useSources } from './useSources';

const emit = defineEmits<{ done: [] }>();
const { add } = useSources();

const urlInput = ref('');
const busy = ref('');
const error = ref('');
const home = ref<ParsedPage | null>(null);
const llms = ref<string | null>(null);
const picked = ref<string[]>([]);
const failed = ref<{ url: string; error: string }[]>([]);
const reviewText = ref<string | null>(null);
const resumeAdded = ref('');

const tooLittle = computed(
  () => home.value !== null && realTextLength(home.value.text + (llms.value ?? '')) < MIN_SITE_TEXT,
);

function reset() {
  home.value = null;
  llms.value = null;
  picked.value = [];
  failed.value = [];
  reviewText.value = null;
  error.value = '';
  resumeAdded.value = '';
}

/** Permission first, inside the click handler, before any await (it needs the gesture). */
function importSite() {
  reset();
  let url: string;
  try {
    url = normalizeUrl(urlInput.value);
  } catch {
    error.value = "That doesn't look like a web address.";
    return;
  }
  const request = browser.permissions.request({ origins: originPatterns(url) });
  void (async () => {
    if (!(await request)) {
      error.value = `${new URL(url).host} wasn't allowed, so it can't be read. You can paste the text as a note instead.`;
      return;
    }
    busy.value = 'Reading the site';
    try {
      const [page, llmsTxt] = await Promise.all([fetchPage(url), fetchLlmsTxt(url)]);
      home.value = page;
      llms.value = llmsTxt;
      picked.value = [];
    } catch (err) {
      error.value =
        err instanceof Error && 'status' in err
          ? `The site returned ${(err as { status: number }).status}.`
          : "Couldn't load the site.";
    } finally {
      busy.value = '';
    }
  })();
}

async function continueToReview() {
  if (!home.value) return;
  busy.value = picked.value.length ? `Reading ${picked.value.length} pages` : '';
  const results = await fetchPages(picked.value, 2);
  busy.value = '';
  failed.value = results.filter((r): r is { url: string; error: string } => 'error' in r);
  const pages = [home.value, ...results.filter((r): r is ParsedPage => !('error' in r))];
  const parts = pages.map((p) => `# ${p.title || p.url}\n${p.text}`);
  if (llms.value) parts.unshift(`# llms.txt\n${llms.value}`);
  reviewText.value = parts.join('\n\n');
}

/** Linked resume PDFs are downloaded only after the user asks (spec 3.7). */
async function importResumePdf(url: string) {
  busy.value = 'Reading the resume PDF';
  error.value = '';
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const { extractPdfText } = await import('@/kb/pdf');
    const result = await extractPdfText(await res.arrayBuffer());
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'resume.pdf');
    await add(
      newSource('resume', name.replace(/\.pdf$/i, ''), result.text, { url, fileName: name }),
    );
    resumeAdded.value = `Added ${name} as a source.`;
  } catch {
    error.value = "Couldn't read that PDF.";
  } finally {
    busy.value = '';
  }
}

async function save(value: { label: string; text: string }) {
  if (!home.value) return;
  await add(newSource('website', value.label, value.text, { url: home.value.url }));
  reset();
  urlInput.value = '';
  emit('done');
}

function openSite() {
  if (home.value) void browser.tabs.create({ url: home.value.url });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <form class="flex flex-col gap-2" @submit.prevent="importSite">
      <label for="site-url" class="font-medium">Add website</label>
      <div class="flex gap-2">
        <input
          id="site-url"
          v-model="urlInput"
          class="w-full max-w-md field-input px-3 py-1.5"
          placeholder="yourname.dev"
          data-testid="site-url"
        />
        <button class="btn" type="submit" :disabled="!urlInput.trim() || !!busy">Import</button>
      </div>
      <p class="text-[13px] text-graphite-2">
        Chrome will ask to let AnswerSnap read that one site. Tip: publishing a plain /llms.txt or
        /about page helps this importer and recruiters' tools.
      </p>
    </form>

    <p v-if="busy" role="status">{{ busy }}</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <p v-if="resumeAdded" role="status" class="text-graphite-2">{{ resumeAdded }}</p>

    <div
      v-if="home && reviewText === null && !busy"
      class="flex flex-col gap-3"
      data-testid="site-result"
    >
      <p>
        Found {{ realTextLength(home.text).toLocaleString() }} characters on
        {{ home.title || home.url }}<template v-if="llms">, plus an llms.txt file</template>.
      </p>

      <div
        v-if="tooLittle"
        class="notice flex flex-col items-start gap-2"
        data-testid="site-fallback"
      >
        <p>
          This site returned almost no text. It probably draws its content with JavaScript or 3D, so
          a plain download can't see it.
        </p>
        <p>
          Open the site, right-click the page, and pick "Import this page into AnswerSnap".
          AnswerSnap then reads what the page shows. If the text is drawn inside a 3D scene, the
          review screen offers "Read with AI".
        </p>
        <button class="btn" type="button" @click="openSite">Open the site</button>
      </div>

      <fieldset v-if="home.links.length" class="flex flex-col gap-1">
        <legend class="mb-1 font-medium">Other pages on this site</legend>
        <label v-for="link in home.links" :key="link" class="flex items-center gap-2">
          <input v-model="picked" type="checkbox" :value="link" />
          <span class="break-all">{{ link }}</span>
        </label>
        <p class="text-[13px] text-graphite-2">
          Pages that only exist after the site's app loads will fail here. Use "Import this page"
          for those.
        </p>
      </fieldset>

      <div v-for="pdf in home.resumeLinks" :key="pdf" class="flex flex-wrap items-center gap-2">
        <span
          >Found a resume file: <span class="break-all">{{ pdf }}</span></span
        >
        <button class="btn" type="button" @click="importResumePdf(pdf)">Download and add it</button>
      </div>

      <div class="flex gap-2">
        <button class="btn btn-primary" type="button" @click="continueToReview">Review text</button>
        <button class="btn" type="button" @click="reset">Cancel</button>
      </div>
    </div>

    <ReviewText
      v-if="home && reviewText !== null"
      :title="`Website: ${hostOf(home.url)}`"
      :label="hostOf(home.url)"
      :text="reviewText"
      @save="save"
      @cancel="reset"
    >
      <ul v-if="failed.length" class="notice text-[13px]">
        <li v-for="f in failed" :key="f.url">{{ f.url }}: {{ f.error }}</li>
      </ul>
    </ReviewText>
  </div>
</template>
