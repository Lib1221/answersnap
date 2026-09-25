<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { BRAND } from '@/config/brand';
import { corruptNoticeItem } from '@/storage/items';
import ProfileTextSection from './ProfileTextSection.vue';
import ProviderSection from './ProviderSection.vue';

const SECTIONS = [
  { id: 'provider', title: 'AI provider' },
  { id: 'profile', title: 'Profile' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const current = ref<SectionId>('provider');
const corrupt = ref<string[]>([]);

function fromHash() {
  const id = location.hash.slice(1);
  if (SECTIONS.some((s) => s.id === id)) current.value = id as SectionId;
}

onMounted(async () => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
  corrupt.value = await corruptNoticeItem.getValue();
});
onUnmounted(() => window.removeEventListener('hashchange', fromHash));

async function dismissCorrupt() {
  await corruptNoticeItem.setValue([]);
  corrupt.value = [];
}
</script>

<template>
  <div class="mx-auto flex max-w-5xl gap-10 px-8 py-8">
    <nav class="w-48 shrink-0" aria-label="Settings sections">
      <p class="mb-4 text-base font-[650]">{{ BRAND.name }}</p>
      <ul class="flex flex-col gap-1">
        <li v-for="s in SECTIONS" :key="s.id">
          <a
            :href="`#${s.id}`"
            class="block rounded-[6px] px-2 py-1"
            :class="current === s.id ? 'bg-canary font-medium' : 'text-graphite-2'"
            :aria-current="current === s.id ? 'page' : undefined"
          >
            {{ s.title }}
          </a>
        </li>
      </ul>
    </nav>
    <main class="min-w-0 flex-1">
      <div
        v-if="corrupt.length"
        class="notice mb-6 flex items-start justify-between gap-4"
        role="alert"
      >
        <p>Some saved data couldn't be read and was reset. A copy was kept in case you need it.</p>
        <button class="btn" type="button" @click="dismissCorrupt">Dismiss</button>
      </div>
      <ProviderSection v-if="current === 'provider'" />
      <ProfileTextSection v-else-if="current === 'profile'" />
    </main>
  </div>
</template>
