import { runResumeTailor, type TailoredResume } from '@/llm/resumeTailor';
import { t } from '@/ui/i18n';
import type { useJob } from './useJob';
import { useJobTool } from './useJobTool';

/** Job > Resume: the candidate's bullets reworded for the saved job post. */
export function useResume(job: ReturnType<typeof useJob>) {
  return useJobTool<TailoredResume>(
    job,
    ({ task, jobText, signal }) =>
      runResumeTailor({
        provider: task.provider,
        model: task.settings.model,
        candidateBlock: task.candidateBlock,
        jobText,
        styleRules: task.settings.styleRules,
        fillGaps: task.settings.fillGaps,
        signal,
      }),
    t('resume_error', "Couldn't tailor the resume. Try again."),
  );
}
