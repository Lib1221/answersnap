<script setup lang="ts">
import { BRAND } from '@/config/brand';
import Icon from './AppIcon.vue';
import { t } from '@/ui/i18n';

defineProps<{ compact?: boolean }>();
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-graphite-2"
    data-testid="credit"
  >
    <span>
      {{ t('credit_made_by', 'Made by') }}
      <a
        :href="BRAND.repoUrl"
        target="_blank"
        rel="noreferrer"
        class="font-semibold text-graphite hover:text-ink"
        >{{ BRAND.author }}</a
      >
    </span>
    <a
      :href="BRAND.repoUrl"
      target="_blank"
      rel="noreferrer"
      class="chip"
      :class="compact ? 'min-h-[26px] px-2' : ''"
      data-testid="star-link"
    >
      <Icon name="github" :size="14" />
      <Icon name="star" :size="13" />
      {{ t('credit_star_on_github', 'Star on GitHub') }}
    </a>
  </div>
</template>
