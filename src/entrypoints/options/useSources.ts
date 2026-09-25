import { computed, onMounted, onUnmounted, ref } from 'vue';
import { estimateTokens } from '@/kb/tokens';
import { getSources, saveSources, sourcesItem } from '@/storage/items';
import type { KnowledgeSource } from '@/storage/schema';

/** Warn when candidate data passes this many tokens (spec 10.6). */
export const CANDIDATE_TOKEN_BUDGET = 30_000;

export function newSource(
  kind: KnowledgeSource['kind'],
  label: string,
  text: string,
  extra: Partial<KnowledgeSource> = {},
): KnowledgeSource {
  const trimmed = text.trim();
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    text: trimmed,
    chars: trimmed.length,
    importedAt: new Date().toISOString(),
    enabled: true,
    ...extra,
  };
}

export function useSources() {
  const sources = ref<KnowledgeSource[]>([]);
  const load = async () => {
    sources.value = await getSources();
  };
  let unwatch: (() => void) | null = null;
  onMounted(() => {
    void load();
    unwatch = sourcesItem.watch(() => void load());
  });
  onUnmounted(() => unwatch?.());

  const enabledTokens = computed(() =>
    sources.value.filter((s) => s.enabled).reduce((n, s) => n + estimateTokens(s.chars), 0),
  );

  async function add(source: KnowledgeSource) {
    await saveSources([...(await getSources()), source]);
  }
  async function update(id: string, patch: Partial<KnowledgeSource>) {
    const next = (await getSources()).map((s) => {
      if (s.id !== id) return s;
      const merged = { ...s, ...patch };
      return { ...merged, chars: merged.text.length };
    });
    await saveSources(next);
  }
  async function remove(id: string) {
    await saveSources((await getSources()).filter((s) => s.id !== id));
  }

  return { sources, enabledTokens, add, update, remove };
}
