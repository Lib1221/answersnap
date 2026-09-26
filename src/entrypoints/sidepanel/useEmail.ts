import { ref, shallowRef, watch } from 'vue';
import { EMAIL_LENGTH, EMAIL_MAX_CHARS, emailQuestion, type EmailKind } from '@/kb/emails';
import type { PendingCapture } from '@/storage/schema';
import { useAnswer } from './useAnswer';
import { useInsert } from './useInsert';
import type { useJob } from './useJob';
import { activeTabRequest } from './useLetter';

/** Job > Email: thank-you notes, follow-ups, and offer replies for the job in front. */
export function useEmail(job: ReturnType<typeof useJob>) {
  const answer = useAnswer();
  const capture = shallowRef<PendingCapture | null>(null);
  const insert = useInsert(capture, answer);

  const kind = ref<EmailKind>('thank-you');
  const company = ref('');
  const role = ref('');
  const recipient = ref('');
  const notes = ref('');

  watch(
    () => job.job.value,
    (j) => {
      if (!j) return;
      if (!company.value.trim() && j.company) company.value = j.company;
      if (!role.value.trim() && j.title) role.value = j.title;
    },
    { immediate: true },
  );

  async function write() {
    const { capture: c } = await activeTabRequest(() =>
      emailQuestion({
        kind: kind.value,
        company: company.value,
        role: role.value,
        recipient: recipient.value,
        notes: notes.value,
      }),
    );
    capture.value = c;
    await answer.run(c, {
      force: 'new',
      length: `${EMAIL_LENGTH}, always under ${EMAIL_MAX_CHARS} characters`,
      limits: { maxChars: EMAIL_MAX_CHARS, explicitChars: false },
    });
  }

  return { answer, insert, kind, company, role, recipient, notes, write };
}
