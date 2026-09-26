import { z } from 'zod';
import { neutralize } from '@/kb/contextBuilder';
import type { LlmProvider, SystemBlock } from './types';

// LinkedIn writer: headline options and an About section from the candidate's own data. A public
// profile anyone can check, so it stays factual in every answer mode.

export const HEADLINE_MAX = 220;

export function linkedinRules(styleRules: string[]): string {
  const style = styleRules.length ? `\nStyle:\n${styleRules.map((r) => `- ${r}`).join('\n')}` : '';
  return `You write a candidate's LinkedIn headline and About section. The candidate data is in <candidate_profile>, <standard_answers>, and <source_documents>. Use only facts from the data: this is a public profile that colleagues and employers will read.

1. headlines: 3 different headline options, each under ${HEADLINE_MAX} characters: the role, the strongest specialty, and one concrete proof point or domain. No emoji, no strings of buzzwords, no pipes between more than three parts.
2. about: an About section in the first person, 150 to 250 words, in 3 or 4 short paragraphs: what the candidate does and for whom, two or three concrete results from the data, how they work, and what they are looking for next. Plain text with a blank line between paragraphs.
3. skills: the 10 skills from the data to feature, most important first.
If <target_role> is given, angle all three toward that role, still using only real facts.${style}`;
}

export const LinkedInSchema = z.object({
  headlines: z.array(z.string()),
  about: z.string(),
  skills: z.array(z.string()),
});
export type LinkedInDraft = z.infer<typeof LinkedInSchema>;

export function cleanLinkedIn(raw: LinkedInDraft): LinkedInDraft {
  return {
    headlines: [...new Set(raw.headlines.map((h) => h.trim()).filter(Boolean))]
      .map((h) => (h.length > HEADLINE_MAX ? h.slice(0, HEADLINE_MAX).trimEnd() : h))
      .slice(0, 3),
    about: raw.about.trim(),
    skills: [...new Set(raw.skills.map((s) => s.trim()).filter(Boolean))].slice(0, 10),
  };
}

export async function runLinkedIn(opts: {
  provider: LlmProvider;
  model: string;
  candidateBlock: string;
  targetRole: string;
  styleRules: string[];
  signal?: AbortSignal;
}): Promise<LinkedInDraft> {
  const system: SystemBlock[] = [
    { text: linkedinRules(opts.styleRules) },
    { text: opts.candidateBlock, cache: true },
  ];
  const target = opts.targetRole.trim();
  const { $schema: _drop, ...schema } = z.toJSONSchema(LinkedInSchema) as Record<string, unknown>;
  const result = await opts.provider.complete(
    {
      model: opts.model,
      maxTokens: 4096,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${target ? `<target_role>${neutralize(target)}</target_role>\n` : ''}Write the LinkedIn headline options and About section.`,
            },
          ],
        },
      ],
      jsonSchema: schema,
      schemaName: 'save_linkedin',
    },
    opts.signal,
  );
  const parsed = LinkedInSchema.safeParse(result.json);
  if (!parsed.success) throw new Error('The LinkedIn draft came back in an unexpected shape.');
  return cleanLinkedIn(parsed.data);
}
