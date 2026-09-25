<script setup lang="ts">
import type { FieldInfo } from '@/storage/schema';
import Icon from '@/ui/AppIcon.vue';
import type { ReviewItem, useFormFill } from './useFormFill';

const props = defineProps<{ state: ReturnType<typeof useFormFill> }>();
const f = props.state;

const KIND_NAMES: Record<FieldInfo['kind'], string> = {
  input: 'input',
  textarea: 'text box',
  contenteditable: 'editor',
  select: 'dropdown',
  'radio-group': 'choice',
  'checkbox-group': 'checkboxes',
};

function toggleDraft(id: string, on: boolean) {
  const next = new Set(f.toDraft.value);
  if (on) next.add(id);
  else next.delete(id);
  f.toDraft.value = next;
}

function label(field: FieldInfo) {
  return field.label || field.placeholder || field.hint || 'Unlabeled field';
}

const isChoice = (i: ReviewItem) =>
  ['select', 'radio-group'].includes(i.field.kind) && !!i.field.options?.length;
const over = (i: ReviewItem) => i.answer.length > i.limits.maxChars;
const busy = () => f.phase.value === 'drafting' || f.phase.value === 'inserting';
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="form-fill">
    <div
      v-if="f.phase.value === 'idle' || f.phase.value === 'scanning'"
      class="card flex flex-col items-center gap-3 px-5 py-8 text-center"
    >
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-soft text-ink">
        <Icon name="form" :size="26" />
      </div>
      <h2 class="text-[15px] font-[650]">Fill the whole form</h2>
      <p class="text-graphite-2">
        Draft answers for every field on this form at once. You review everything before anything is
        filled.
      </p>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="f.phase.value === 'scanning'"
        @click="f.scan"
      >
        <Icon name="target" />
        {{ f.phase.value === 'scanning' ? 'Reading the form' : 'Scan this form' }}
      </button>
      <p class="text-[12.5px] text-graphite-2">
        Or right-click the page and choose "Fill this form with AnswerSnap".
      </p>
    </div>

    <template v-else-if="f.phase.value === 'scanned' || f.phase.value === 'drafting'">
      <p>
        Found {{ f.fields.value.length }} {{ f.fields.value.length === 1 ? 'field' : 'fields' }}
        <template v-if="f.page.value?.title">on {{ f.page.value.title }}</template
        >. Untick any you'll answer yourself.
      </p>
      <ul class="card flex flex-col divide-y divide-rule px-3" data-testid="form-fields">
        <li
          v-for="field in f.fields.value"
          :key="field.targetId"
          class="flex items-start gap-2 py-2"
          @mouseenter="f.highlight(field.targetId, true)"
          @mouseleave="f.highlight(field.targetId, false)"
        >
          <input
            type="checkbox"
            class="mt-1"
            :checked="f.toDraft.value.has(field.targetId)"
            :aria-label="`Draft ${label(field)}`"
            :disabled="busy()"
            @change="toggleDraft(field.targetId, ($event.target as HTMLInputElement).checked)"
          />
          <span class="min-w-0">
            <span class="block">{{ label(field) }}</span>
            <span class="text-[12px] text-graphite-2">
              {{ KIND_NAMES[field.kind] }}<template v-if="field.required">, required</template
              ><template v-if="field.currentValue">, already filled</template>
            </span>
          </span>
        </li>
      </ul>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="f.phase.value === 'drafting'">
          <span role="status">{{ f.progress.value }}</span>
          <button class="btn" type="button" @click="f.stop">Stop</button>
        </template>
        <template v-else>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!f.toDraft.value.size"
            @click="f.draft"
          >
            Draft {{ f.toDraft.value.size }} {{ f.toDraft.value.size === 1 ? 'answer' : 'answers' }}
          </button>
          <button class="btn btn-quiet" type="button" @click="f.scan">Scan again</button>
        </template>
      </div>
    </template>

    <template v-else>
      <p class="text-[13px] text-graphite-2">
        Check each answer, untick anything you don't want, then insert. AnswerSnap never submits the
        form.
      </p>
      <ol class="flex flex-col gap-3" data-testid="form-review">
        <li
          v-for="item in f.items.value"
          :key="item.field.targetId"
          class="card flex flex-col gap-1.5 border-l-4 p-3"
          :class="
            item.result === 'inserted'
              ? 'border-ink'
              : item.result === 'failed'
                ? 'border-carbon-pink-text'
                : 'border-rule'
          "
          data-testid="form-item"
          @mouseenter="f.highlight(item.field.targetId, true)"
          @mouseleave="f.highlight(item.field.targetId, false)"
        >
          <label class="flex items-start gap-2 font-medium">
            <input
              v-model="item.insert"
              type="checkbox"
              class="mt-1"
              :disabled="busy() || !item.answer.trim()"
            />
            <span>{{ item.question || label(item.field) }}</span>
          </label>
          <select
            v-if="isChoice(item)"
            v-model="item.answer"
            class="field-input px-2 py-1.5"
            :aria-label="`Answer for ${label(item.field)}`"
          >
            <option value="">No answer</option>
            <option v-for="o in item.field.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <textarea
            v-else
            v-model="item.answer"
            :rows="item.field.kind === 'input' ? 1 : 4"
            class="field-input p-2 text-[14px]"
            :aria-label="`Answer for ${label(item.field)}`"
          />
          <p class="flex flex-wrap gap-x-3 text-[12px] text-graphite-2">
            <span v-if="item.source === 'library'">From your saved answers</span>
            <span v-if="item.type === 'assessment'">A test question, so no answer is drafted</span>
            <span
              v-if="item.field.kind !== 'input' && !isChoice(item)"
              class="tabular-nums"
              :class="over(item) ? 'text-carbon-pink-text' : ''"
            >
              {{ item.answer.length.toLocaleString() }} /
              {{ item.limits.maxChars.toLocaleString() }} characters
            </span>
            <span v-if="item.notes">{{ item.notes }}</span>
          </p>
          <p v-if="item.missing.length" class="flex flex-wrap gap-1">
            <span
              v-for="m in item.missing"
              :key="m"
              class="rounded-[6px] bg-carbon-pink px-2 py-0.5 text-[12px] text-carbon-pink-text"
              >{{ m }}</span
            >
          </p>
          <p v-if="item.result === 'inserted'" class="text-[13px] text-ink">✓ Inserted</p>
          <p v-else-if="item.result === 'failed'" class="notice text-[13px]">
            {{ item.resultNote }}
          </p>
        </li>
      </ol>
      <div
        class="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-rule bg-paper py-3"
      >
        <button
          class="btn btn-primary"
          type="button"
          :disabled="busy() || !f.selectedCount.value"
          data-testid="insert-selected"
          @click="f.insertSelected"
        >
          {{
            f.phase.value === 'inserting' ? 'Inserting' : `Insert ${f.selectedCount.value} selected`
          }}
        </button>
        <button class="btn btn-quiet" type="button" :disabled="busy()" @click="f.scan">
          Scan again
        </button>
        <span
          v-if="f.phase.value === 'done'"
          role="status"
          class="text-[13px]"
          data-testid="form-summary"
        >
          Inserted {{ f.summary.value.done }}.<template v-if="f.summary.value.failed">
            {{ f.summary.value.failed }} need a look.</template
          >
          Check the page, then submit it yourself.
        </span>
      </div>
    </template>

    <p v-if="f.error.value" class="notice" role="alert">{{ f.error.value }}</p>
  </section>
</template>
