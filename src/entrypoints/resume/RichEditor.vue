<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { insertLink, safeUrl, toggleList, toggleMark, type Edit } from '@/kb/richText';
import Icon from '@/ui/AppIcon.vue';

// A plain textarea with a formatting toolbar. The text is the markdown subset of
// src/kb/richText.ts, so nothing here ever renders HTML.

const text = defineModel<string>({ required: true });
const props = withDefaults(defineProps<{ label?: string; placeholder?: string }>(), {
  label: 'Description',
  placeholder: '',
});

const id = useId();
const ta = ref<HTMLTextAreaElement | null>(null);
const urlInput = ref<HTMLInputElement | null>(null);
const linkOpen = ref(false);
const linkUrl = ref('');
const linkError = ref('');
let linkSel: { start: number; end: number } | null = null;

const mod = /Mac|iPhone|iPad/i.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';

function current(): Edit {
  const el = ta.value!;
  return { value: el.value, start: el.selectionStart, end: el.selectionEnd };
}

/**
 * Replace the changed middle of the text through the browser's editing command, so Ctrl+Z still
 * undoes a toolbar action. execCommand is deprecated but still the only way to keep a textarea's
 * undo history; when it is missing, the value is set directly.
 */
function replaceKeepingUndo(el: HTMLTextAreaElement, next: string): boolean {
  const prev = el.value;
  let a = 0;
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let b = 0;
  while (
    b < prev.length - a &&
    b < next.length - a &&
    prev[prev.length - 1 - b] === next[next.length - 1 - b]
  )
    b++;
  const insert = next.slice(a, next.length - b);
  try {
    el.focus();
    el.setSelectionRange(a, prev.length - b);
    const ok = insert
      ? document.execCommand('insertText', false, insert)
      : document.execCommand('delete');
    return ok && el.value === next;
  } catch {
    return false;
  }
}

async function commit(next: Edit) {
  const el = ta.value;
  if (!el) return;
  if (next.value !== el.value && !replaceKeepingUndo(el, next.value)) text.value = next.value;
  await nextTick();
  el.focus();
  el.setSelectionRange(next.start, next.end);
  resize();
}

function mark(m: '**' | '*' | '__') {
  if (ta.value) void commit(toggleMark(current(), m));
}

function list(kind: 'bullets' | 'numbered') {
  if (ta.value) void commit(toggleList(current(), kind));
}

async function openLink() {
  if (!ta.value) return;
  const { start, end } = current();
  linkSel = { start, end };
  linkUrl.value = '';
  linkError.value = '';
  linkOpen.value = true;
  await nextTick();
  urlInput.value?.focus();
}

function closeLink() {
  linkOpen.value = false;
  linkError.value = '';
  const sel = linkSel;
  linkSel = null;
  const el = ta.value;
  if (el && sel) {
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }
}

function addLink() {
  const href = safeUrl(linkUrl.value);
  if (!href) {
    linkError.value = 'Enter a web address like https://example.com, or an email address.';
    return;
  }
  const el = ta.value;
  const sel = linkSel ?? { start: el?.value.length ?? 0, end: el?.value.length ?? 0 };
  linkOpen.value = false;
  linkError.value = '';
  linkSel = null;
  if (el) void commit(insertLink({ value: el.value, ...sel }, href));
}

/** Enter on a list line starts the next item; Enter on an empty item ends the list. */
function continueList(ev: KeyboardEvent) {
  const el = ta.value;
  if (!el || el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const value = el.value;
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const nl = value.indexOf('\n', caret);
  const lineEnd = nl === -1 ? value.length : nl;
  const m = value.slice(lineStart, caret).match(/^(\s*)(?:([-•*])|(\d+)([.)]))\s+/);
  if (!m) return;
  ev.preventDefault();
  const markerEnd = lineStart + m[0].length;
  if (!value.slice(markerEnd, lineEnd).trim() && caret >= markerEnd) {
    // Empty item: drop the marker and leave the list.
    void commit({
      value: value.slice(0, lineStart) + value.slice(markerEnd),
      start: lineStart,
      end: lineStart,
    });
    return;
  }
  const marker = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
  const insert = `\n${m[1]}${marker} `;
  const pos = caret + insert.length;
  void commit({ value: value.slice(0, caret) + insert + value.slice(caret), start: pos, end: pos });
}

function onKeydown(ev: KeyboardEvent) {
  const withMod = ev.ctrlKey || ev.metaKey;
  if (withMod && !ev.altKey && !ev.shiftKey) {
    const k = ev.key.toLowerCase();
    const m = k === 'b' ? '**' : k === 'i' ? '*' : k === 'u' ? '__' : null;
    if (m) {
      ev.preventDefault();
      mark(m);
    }
    return;
  }
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.altKey && !ev.isComposing) continueList(ev);
}

// Auto-grow: Chrome sizes the textarea with CSS (field-sizing); other browsers get it measured.
const nativeSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

function resize() {
  const el = ta.value;
  if (nativeSizing || !el) return;
  const scroller = document.scrollingElement;
  const top = scroller?.scrollTop ?? 0;
  el.style.height = 'auto';
  if (el.scrollHeight) el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  if (scroller) scroller.scrollTop = top;
}

watch(text, () => void nextTick(resize));

let observer: ResizeObserver | null = null;
let lastWidth = 0;
onMounted(() => {
  resize();
  if (nativeSizing || !ta.value || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    const w = entry?.contentRect.width ?? 0;
    if (w !== lastWidth) {
      lastWidth = w;
      resize();
    }
  });
  observer.observe(ta.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      class="rounded-control border border-rule bg-paper has-[textarea:focus]:border-ink has-[textarea:focus]:outline-3 has-[textarea:focus]:outline-ink/20"
    >
      <div
        role="group"
        :aria-label="`${props.label} formatting`"
        class="flex flex-wrap items-center gap-0.5 border-b border-rule px-1 py-1"
      >
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7 text-[14px] font-bold"
          aria-label="Bold"
          :title="`Bold (${mod}+B)`"
          data-testid="rich-bold"
          @mousedown.prevent
          @click="mark('**')"
        >
          B
        </button>
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7 font-serif text-[15px] italic"
          aria-label="Italic"
          :title="`Italic (${mod}+I)`"
          data-testid="rich-italic"
          @mousedown.prevent
          @click="mark('*')"
        >
          I
        </button>
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7 text-[14px] underline underline-offset-2"
          aria-label="Underline"
          :title="`Underline (${mod}+U)`"
          data-testid="rich-underline"
          @mousedown.prevent
          @click="mark('__')"
        >
          U
        </button>
        <span class="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7"
          aria-label="Bullet list"
          title="Bullet list"
          data-testid="rich-bullets"
          @mousedown.prevent
          @click="list('bullets')"
        >
          <Icon name="form" :size="15" />
        </button>
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7"
          aria-label="Numbered list"
          title="Numbered list"
          data-testid="rich-numbered"
          @mousedown.prevent
          @click="list('numbered')"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 6h11" />
            <path d="M10 12h11" />
            <path d="M10 18h11" />
            <path d="M4 4.5 5.5 3.5v5" />
            <path d="M3.5 13.5c0-1.2 2.5-1.6 2.5-.1 0 .9-2.5 2-2.5 3.1H6" />
          </svg>
        </button>
        <span class="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        <button
          type="button"
          class="btn btn-icon size-7 min-h-7"
          aria-label="Link"
          title="Link"
          :aria-expanded="linkOpen"
          :aria-controls="`${id}-link`"
          data-testid="rich-link"
          @mousedown.prevent
          @click="linkOpen ? closeLink() : openLink()"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
        </button>
      </div>

      <div
        v-if="linkOpen"
        :id="`${id}-link`"
        class="flex flex-wrap items-center gap-2 border-b border-rule bg-surface px-2 py-2"
      >
        <label :for="`${id}-url`" class="text-[12.5px] font-medium">Link address</label>
        <input
          :id="`${id}-url`"
          ref="urlInput"
          v-model="linkUrl"
          type="url"
          inputmode="url"
          placeholder="https://"
          class="field-input min-w-0 flex-1 px-2 py-1 text-[13px]"
          :aria-invalid="!!linkError"
          :aria-describedby="linkError ? `${id}-link-error` : undefined"
          data-testid="rich-link-url"
          @keydown.enter.prevent="addLink"
          @keydown.esc.prevent="closeLink"
        />
        <button
          type="button"
          class="btn min-h-7 px-2.5 text-[13px]"
          data-testid="rich-link-add"
          @click="addLink"
        >
          Add
        </button>
        <button type="button" class="btn btn-quiet min-h-7 text-[13px]" @click="closeLink">
          Cancel
        </button>
        <p
          v-if="linkError"
          :id="`${id}-link-error`"
          class="w-full text-[12.5px] text-carbon-pink-text"
          role="alert"
        >
          {{ linkError }}
        </p>
      </div>

      <textarea
        :id="id"
        ref="ta"
        v-model="text"
        rows="4"
        :aria-label="props.label"
        :aria-describedby="`${id}-hint`"
        :placeholder="props.placeholder"
        class="block min-h-[calc(4lh+18px)] w-full resize-none overflow-hidden bg-transparent px-3 py-2 leading-relaxed [field-sizing:content] focus:outline-none"
        data-testid="rich-editor"
        @keydown="onKeydown"
      />
    </div>
    <p :id="`${id}-hint`" class="text-[12px] text-graphite-2">
      Use - for bullets. Select text and press {{ mod }}+B for bold.
    </p>
  </div>
</template>
