import { getProfile, getSources, getStandardAnswers } from '@/storage/items';
import type { CandidateData } from './contextBuilder';
import { filledStandardAnswers } from './profileSchema';

/** Everything the prompt may use about the candidate (spec 10.6, system block 2). */
export async function loadCandidateData(): Promise<CandidateData> {
  const [record, sa, sources] = await Promise.all([
    getProfile(),
    getStandardAnswers(),
    getSources(),
  ]);
  return { profile: record?.profile ?? null, standardAnswers: filledStandardAnswers(sa), sources };
}
