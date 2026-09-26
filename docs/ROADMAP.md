# AnswerSnap roadmap

A running to-do list of features. Done items stay here, checked, so the history of what the
extension can do is in one place. Items marked "needs Liben's OK" touch a hard rule in
`CLAUDE.md` (new permissions, new dependencies, or sending data somewhere new).

## Done

- [x] Snip a question, draft an answer from your own resume and sources (v1)
- [x] Anthropic and Google Gemini (free tier), bring your own key
- [x] Automatic model fallback when a Gemini model hits its free limit
- [x] Fact check: every sentence checked against your profile
- [x] Fill the whole form at once, with review before insert
- [x] Modern UI, "Made by Liben", Star on GitHub
- [x] Answer confidently: no "I have not worked with X" answers
- [x] Cover letter: your own letter in Settings, and a Letter tab that writes one per job

## Now (building in this order)

- [x] **Job tab**: one place for everything about the job in front: Letter, Fit, Interview,
      Email. Replaces the Letter tab so the panel keeps five tabs.
- [x] **Job fit check**: match score, requirements you meet (with evidence from your
      profile), gaps with what to do about them, keywords to use, and talking points.
- [x] **Interview prep**: likely questions for this job (behavioral, technical, role,
      company) with suggested answers from your profile; copy or save to the Library.
- [x] **Follow-up emails**: thank-you after an interview, follow-up after applying,
      check-in while waiting, accept or decline an offer, withdraw. Subject line included.
- [ ] **Application tracker**: saving a job post starts tracking it. Status (saved, applied,
      interviewing, offer, rejected, withdrawn) from the Job tab; a Settings page lists every
      application with dates, notes, filters, and a CSV export. Included in backups.
- [ ] **Story bank**: STAR stories (situation, task, action, result, skills) in Settings.
      Answers, letters, and interview prep use them like any source.

## Next

- [ ] Reminders to follow up on applications with no reply after N days (needs the
      `alarms` and `notifications` permissions: needs Liben's OK)
- [ ] Resume tailoring: suggested resume bullet rewrites for a job post
- [ ] Answer variants: two or three drafts side by side, pick one
- [ ] Keyboard-only flow: snip, draft, insert without the mouse
- [ ] Per-site memory: remember answers given on a site and reuse them on its later steps
- [ ] Weekly summary on the Applications page (applied, interviews, offers)
- [ ] LinkedIn "About" and headline writer from the profile

## Later

- [ ] OpenRouter or local Ollama as providers (new host permissions: needs Liben's OK)
- [ ] Sync across devices with `storage.sync` (size limits; needs a design)
- [ ] Firefox build (WXT supports it; side panel differs)
- [ ] Translations of the UI (strings already go through `t()`)
