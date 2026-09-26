<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { DETAIL_KINDS, DETAIL_LABELS, type DetailKind, type Personal } from '@/kb/resume/model';
import Icon from '@/ui/AppIcon.vue';
import { HANDLE_KINDS, LINK_KINDS } from './doc/contacts';

const personal = defineModel<Personal>({ required: true });

type Detail = Personal['details'][number];
type TextKey = 'fullName' | 'jobTitle' | 'email' | 'phone' | 'location';

const id = useId();
const root = ref<HTMLElement | null>(null);
const photoError = ref('');
const photoBusy = ref(false);

function set<K extends keyof Personal>(k: K, v: Personal[K]) {
  personal.value = { ...personal.value, [k]: v };
}

function onText(k: TextKey, e: Event) {
  set(k, (e.target as HTMLInputElement).value);
}

// ---- Photo: downscaled in the page and kept as a small JPEG data URL, never uploaded.

// 600 px keeps a zoomed-in crop sharp on the printed page (FlowCV keeps the same size).
const PHOTO_MAX = 600;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('read')));
    r.onerror = () => reject(r.error ?? new Error('read'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
}

async function shrink(file: File): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file));
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error('empty');
  const scale = Math.min(1, PHOTO_MAX / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  // JPEG has no transparency: put see-through photos on white rather than black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function onPhoto(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  photoError.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    photoError.value = 'Choose an image file, such as a JPEG or PNG.';
    return;
  }
  photoBusy.value = true;
  try {
    const photo = await shrink(file);
    personal.value = { ...personal.value, photo, photoZoom: 1, photoX: 50, photoY: 50 };
  } catch {
    photoError.value = 'That image could not be read. Try a JPEG or PNG.';
  } finally {
    photoBusy.value = false;
  }
}

function removePhoto() {
  photoError.value = '';
  set('photo', '');
}

// ---- Photo crop: zoom around a focus point, moved by dragging the preview or with the arrows.

const cropStyle = computed(() => {
  const at = `${personal.value.photoX}% ${personal.value.photoY}%`;
  return {
    objectPosition: at,
    transformOrigin: at,
    transform: personal.value.photoZoom > 1 ? `scale(${personal.value.photoZoom})` : undefined,
  };
});
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));

function nudge(dx: number, dy: number) {
  personal.value = {
    ...personal.value,
    photoX: clampPct(personal.value.photoX + dx),
    photoY: clampPct(personal.value.photoY + dy),
  };
}

let drag: { x: number; y: number; size: number } | null = null;
function onCropDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, size: el.clientWidth || 80 };
}
function onCropMove(e: PointerEvent) {
  if (!drag) return;
  // Dragging the picture right shows more of its left side: the focus point moves left.
  const k = 100 / drag.size / personal.value.photoZoom;
  nudge(-(e.clientX - drag.x) * k, -(e.clientY - drag.y) * k);
  drag = { ...drag, x: e.clientX, y: e.clientY };
}
function onCropUp() {
  drag = null;
}
function onCropKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 2;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [step, 0],
    ArrowRight: [-step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const m = moves[e.key];
  if (!m) return;
  e.preventDefault();
  nudge(m[0], m[1]);
}
function setZoom(e: Event) {
  set('photoZoom', Number((e.target as HTMLInputElement).value));
}
function resetCrop() {
  personal.value = { ...personal.value, photoZoom: 1, photoX: 50, photoY: 50 };
}

// ---- Extra details (links, date of birth, nationality...)

/** Every kind can be added once, except "Other", which can repeat. */
const available = computed(() =>
  DETAIL_KINDS.filter((k) => k === 'other' || !personal.value.details.some((d) => d.kind === k)),
);
/** The picker in two groups: links and profiles first, then personal details and "Other". */
const addGroups = computed(() =>
  [
    { key: 'links', name: 'Links and profiles', kinds: available.value.filter(isLink) },
    { key: 'personal', name: 'Personal', kinds: available.value.filter((k) => !isLink(k)) },
  ].filter((g) => g.kinds.length),
);

function setDetails(details: Detail[]) {
  set('details', details);
}

function updateDetail(i: number, p: Partial<Detail>) {
  setDetails(personal.value.details.map((d, j) => (j === i ? { ...d, ...p } : d)));
}

async function addDetail(kind: DetailKind) {
  const i = personal.value.details.length;
  setDetails([
    ...personal.value.details,
    { kind, label: kind === 'other' ? '' : DETAIL_LABELS[kind], value: '' },
  ]);
  await nextTick();
  const row = root.value?.querySelector(`[data-detail-index="${i}"]`);
  row?.querySelector<HTMLInputElement>(kind === 'other' ? 'input' : '[data-detail-value]')?.focus();
}

async function removeDetail(i: number) {
  const next = personal.value.details.filter((_, j) => j !== i);
  setDetails(next);
  await nextTick();
  const target = next.length
    ? root.value?.querySelector<HTMLElement>(
        `[data-detail-index="${Math.min(i, next.length - 1)}"] [data-detail-remove]`,
      )
    : root.value?.querySelector<HTMLElement>('[data-add-detail]');
  target?.focus();
}

/** The resume lists details in this order. Rows swap in place, so focus follows the moved row. */
async function moveDetail(i: number, delta: -1 | 1) {
  const j = i + delta;
  const list = personal.value.details.slice();
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  setDetails(list);
  await nextTick();
  const row = root.value?.querySelector(`[data-detail-index="${j}"]`);
  const self = row?.querySelector<HTMLButtonElement>(`[data-move="${delta}"]`);
  const other = row?.querySelector<HTMLButtonElement>(`[data-move="${-delta}"]`);
  (self && !self.disabled ? self : other)?.focus();
}

function isLink(k: DetailKind): boolean {
  return LINK_KINDS.has(k);
}
/** Web addresses get the URL keyboard; handles (Skype name, phone number) do not. */
function inputMode(k: DetailKind): 'url' | undefined {
  return LINK_KINDS.has(k) && !HANDLE_KINDS.has(k) ? 'url' : undefined;
}

const DETAIL_PLACEHOLDER: Partial<Record<DetailKind, string>> = {
  website: 'example.com',
  linkedin: 'linkedin.com/in/your-name',
  github: 'github.com/your-name',
  portfolio: 'example.com/work',
  gitlab: 'gitlab.com/your-name',
  stackoverflow: 'stackoverflow.com/users/123/your-name',
  orcid: 'orcid.org/0000-0000-0000-0000',
  scholar: 'scholar.google.com/citations?user=ID',
  researchgate: 'researchgate.net/profile/Your-Name',
  behance: 'behance.net/your-name',
  dribbble: 'dribbble.com/your-name',
  medium: 'medium.com/@your-name',
  x: 'x.com/your-name',
  youtube: 'youtube.com/@your-name',
  instagram: 'instagram.com/your-name',
  telegram: 't.me/your-name',
  whatsapp: 'wa.me/15551234567',
  skype: 'Skype name',
  dateOfBirth: '14 March 1998',
  other: 'Text or a web address',
};

function detailName(d: Detail): string {
  return d.kind === 'other' ? d.label.trim() || 'Other detail' : DETAIL_LABELS[d.kind];
}
</script>

<template>
  <section
    ref="root"
    class="card flex flex-col gap-4 p-4"
    :aria-labelledby="`${id}-heading`"
    data-testid="personal-editor"
  >
    <h2 :id="`${id}-heading`" class="text-[15px] font-semibold">Personal details</h2>

    <div class="flex items-start gap-4">
      <div class="flex shrink-0 flex-col items-center gap-2">
        <div
          v-if="personal.photo"
          class="size-20 cursor-move touch-none overflow-hidden rounded-full border border-rule focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          tabindex="0"
          role="group"
          aria-label="Photo crop. Drag the photo or use the arrow keys to move it."
          title="Drag to move the photo"
          data-testid="pd-photo-crop"
          @pointerdown="onCropDown"
          @pointermove="onCropMove"
          @pointerup="onCropUp"
          @pointercancel="onCropUp"
          @keydown="onCropKey"
        >
          <img
            :src="personal.photo"
            alt="Your photo"
            class="pointer-events-none size-full object-cover select-none"
            :style="cropStyle"
            draggable="false"
            data-testid="pd-photo"
          />
        </div>
        <div
          v-else
          class="grid size-20 place-items-center rounded-full border border-dashed border-rule bg-surface text-graphite-2"
          aria-hidden="true"
        >
          <Icon name="user" :size="28" />
        </div>
        <label
          class="btn btn-quiet min-h-7 cursor-pointer px-2 text-[12.5px] focus-within:outline-2 focus-within:outline-ink"
          :aria-busy="photoBusy"
        >
          {{ personal.photo ? 'Change photo' : 'Add photo' }}
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            data-testid="pd-photo-input"
            @change="onPhoto"
          />
        </label>
        <template v-if="personal.photo">
          <label class="flex w-24 flex-col gap-0.5 text-[12px] text-graphite-2">
            Zoom
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              class="accent-ink"
              :value="personal.photoZoom"
              data-testid="pd-photo-zoom"
              @input="setZoom"
            />
          </label>
          <button
            v-if="personal.photoZoom !== 1 || personal.photoX !== 50 || personal.photoY !== 50"
            type="button"
            class="btn btn-quiet min-h-7 px-2 text-[12.5px] text-graphite-2"
            data-testid="pd-photo-reset"
            @click="resetCrop"
          >
            Reset crop
          </button>
          <button
            type="button"
            class="btn btn-quiet min-h-7 px-2 text-[12.5px] text-graphite-2"
            data-testid="pd-photo-remove"
            @click="removePhoto"
          >
            Remove photo
          </button>
        </template>
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Full name
          <input
            :value="personal.fullName"
            autocomplete="name"
            class="field-input px-2.5 py-1.5 font-normal"
            data-testid="pd-name"
            @input="onText('fullName', $event)"
          />
        </label>
        <label class="flex flex-col gap-1 text-[13px] font-medium">
          Professional title
          <input
            :value="personal.jobTitle"
            autocomplete="organization-title"
            placeholder="Product designer"
            class="field-input px-2.5 py-1.5 font-normal"
            data-testid="pd-title"
            @input="onText('jobTitle', $event)"
          />
        </label>
      </div>
    </div>

    <p v-if="photoError" class="notice text-[13px]" role="alert">{{ photoError }}</p>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex min-w-0 flex-col gap-1 text-[13px] font-medium">
        Email
        <input
          :value="personal.email"
          type="email"
          autocomplete="email"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="pd-email"
          @input="onText('email', $event)"
        />
      </label>
      <label class="flex min-w-0 flex-col gap-1 text-[13px] font-medium">
        Phone
        <input
          :value="personal.phone"
          type="tel"
          autocomplete="tel"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="pd-phone"
          @input="onText('phone', $event)"
        />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-[13px] font-medium">
        Location
        <input
          :value="personal.location"
          placeholder="City, Country"
          class="field-input px-2.5 py-1.5 font-normal"
          data-testid="pd-location"
          @input="onText('location', $event)"
        />
      </label>
    </div>

    <ul v-if="personal.details.length" class="flex flex-col gap-3">
      <li
        v-for="(d, i) in personal.details"
        :key="i"
        class="flex items-end gap-2"
        :data-detail-index="i"
        data-testid="pd-detail"
      >
        <label
          v-if="d.kind === 'other'"
          class="flex w-2/5 min-w-0 flex-col gap-1 text-[13px] font-medium"
        >
          Label
          <input
            :value="d.label"
            placeholder="Hobby, Availability..."
            class="field-input px-2.5 py-1.5 font-normal"
            data-testid="pd-detail-label"
            @input="updateDetail(i, { label: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label class="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-medium">
          {{ d.kind === 'other' ? 'Value' : DETAIL_LABELS[d.kind] }}
          <input
            :value="d.value"
            :inputmode="inputMode(d.kind)"
            :placeholder="DETAIL_PLACEHOLDER[d.kind]"
            class="field-input px-2.5 py-1.5 font-normal"
            data-detail-value
            :data-testid="`pd-detail-${d.kind}`"
            @input="updateDetail(i, { value: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <div class="mb-0.5 flex shrink-0 items-center">
          <button
            type="button"
            class="btn btn-icon"
            :aria-label="`Move ${detailName(d)} up`"
            title="Move up"
            data-move="-1"
            :disabled="i === 0"
            data-testid="pd-detail-move-up"
            @click="moveDetail(i, -1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-icon"
            :aria-label="`Move ${detailName(d)} down`"
            title="Move down"
            data-move="1"
            :disabled="i === personal.details.length - 1"
            data-testid="pd-detail-move-down"
            @click="moveDetail(i, 1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-icon"
            :aria-label="`Remove ${detailName(d)}`"
            title="Remove"
            data-detail-remove
            data-testid="pd-remove-detail"
            @click="removeDetail(i)"
          >
            <Icon name="x" />
          </button>
        </div>
      </li>
    </ul>

    <div class="flex flex-col gap-2">
      <p :id="`${id}-add`" class="eyebrow">Add details</p>
      <div
        v-for="g in addGroups"
        :key="g.key"
        role="group"
        :aria-labelledby="`${id}-add ${id}-add-${g.key}`"
        class="flex flex-col gap-1.5"
        :data-testid="`pd-add-group-${g.key}`"
      >
        <p :id="`${id}-add-${g.key}`" class="text-[12px] text-graphite-2">{{ g.name }}</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="k in g.kinds"
            :key="k"
            type="button"
            class="chip"
            data-add-detail
            :data-testid="`pd-add-detail-${k}`"
            @click="addDetail(k)"
          >
            <span aria-hidden="true">+</span> {{ DETAIL_LABELS[k] }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
