<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { runLinkedIn, type LinkedInDraft } from '@/llm/linkedin';
import Icon from '@/ui/AppIcon.vue';
import { t } from '@/ui/i18n';
import { jobTaskError, prepareJobTask } from './jobTask';

const targetRole = ref('');
const draft = shallowRef<LinkedInDraft | null>(null);
const busy = ref(false);
const error = ref('');
const copied = ref('');

async function write() {
  error.value = '';
  const task = await prepareJobTask();
  if (!task.ok) return void (error.value = task.error);
  busy.value = true;
  try {
    draft.value = await runLinkedIn({
      provider: task.provider,
      model: task.settings.model,
      candidateBlock: task.candidateBlock,
      targetRole: targetRole.value,
      styleRules: task.settings.styleRules,
    });
  } catch (err) {
    error.value = jobTaskError(
      err,
      task.settings,
      t('linkedin_failed', "Couldn't write the LinkedIn draft. Try again."),
    );
  } finally {
    busy.value = false;
  }
}

async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = id;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {
    // Clipboard refused; the text stays selectable.
  }
}
</script>

<template>
  <section class="card flex flex-col gap-3 p-4" data-testid="linkedin">
    <div class="flex items-center gap-2.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-soft text-ink">
        <Icon name="user" :size="18" />
      </span>
      <div>
        <h2 class="text-[15px] leading-tight font-[650]">{{ t('linkedin_title', 'LinkedIn') }}</h2>
        <p class="text-[12.5px] text-graphite-2">
          {{ t('linkedin_intro', 'Headline options and an About section.') }}
        </p>
      </div>
    </div>
    <label class="flex flex-col gap-1 text-[13px] font-medium">
      {{ t('linkedin_role_label', 'Aim it at a role (optional)') }}
      <input
        v-model="targetRole"
        class="field-input px-2.5 py-1.5 font-normal"
        :placeholder="t('linkedin_role_placeholder', 'Senior Backend Engineer')"
        data-testid="linkedin-role"
      />
    </label>
    <p v-if="busy" role="status" class="flex items-center gap-2 text-[13px] text-graphite-2">
      <span class="h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
      {{ t('linkedin_writing', 'Writing from your profile…') }}
    </p>
    <p v-if="error" class="notice text-[13px]" role="alert">{{ error }}</p>
    <button
      class="btn self-start"
      :class="draft ? '' : 'btn-primary'"
      type="button"
      :disabled="busy"
      data-testid="linkedin-run"
      @click="write"
    >
      <Icon :name="draft ? 'refresh' : 'sparkle'" />
      {{ draft ? t('linkedin_again', 'Write again') : t('linkedin_run', 'Write my LinkedIn') }}
    </button>

    <template v-if="draft && !busy">
      <div class="flex flex-col gap-2">
        <p class="eyebrow">{{ t('linkedin_headlines', 'Headlines') }}</p>
        <ul class="flex flex-col gap-2" data-testid="linkedin-headlines">
          <li
            v-for="(h, i) in draft.headlines"
            :key="h"
            class="flex items-start gap-2 rounded-control bg-surface p-2.5"
          >
            <p class="min-w-0 flex-1 text-[13.5px]">{{ h }}</p>
            <button
              class="btn btn-quiet min-h-0 shrink-0 p-1"
              type="button"
              :aria-label="t('linkedin_copy_headline', 'Copy headline $1', String(i + 1))"
              @click="copy(`h${i}`, h)"
            >
              <Icon :name="copied === `h${i}` ? 'check' : 'copy'" :size="14" />
            </button>
          </li>
        </ul>
      </div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <p class="eyebrow">{{ t('linkedin_about', 'About') }}</p>
          <button
            class="btn btn-quiet min-h-0 text-[12.5px]"
            type="button"
            @click="copy('about', draft.about)"
          >
            <Icon :name="copied === 'about' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'about' ? t('linkedin_copied', 'Copied') : t('linkedin_copy', 'Copy') }}
          </button>
        </div>
        <p
          class="rounded-control bg-surface p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
          data-testid="linkedin-about"
        >
          {{ draft.about }}
        </p>
      </div>
      <div v-if="draft.skills.length" class="flex flex-col gap-2">
        <p class="eyebrow">{{ t('linkedin_skills', 'Skills to feature') }}</p>
        <ul class="flex flex-wrap gap-1.5">
          <li v-for="k in draft.skills" :key="k" class="chip">{{ k }}</li>
        </ul>
      </div>
    </template>
  </section>
</template>
