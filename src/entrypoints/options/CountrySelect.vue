<script setup lang="ts">
import { computed } from 'vue';
import { COUNTRIES, countryName } from '@/kb/countries';

defineProps<{ id?: string; testid?: string }>();
const model = defineModel<string>({ required: true });

const options = computed(() =>
  COUNTRIES.map((c) => ({ code: c.iso2, name: countryName(c.iso2, 'en') }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<template>
  <select :id="id" v-model="model" class="field-input px-2.5 py-1.5" :data-testid="testid">
    <option value="">Choose a country</option>
    <option v-for="c in options" :key="c.code" :value="c.code">{{ c.name }}</option>
  </select>
</template>
