# AnswerSnap roadmap

A running to-do list of features. Done items stay here, checked, so the history of what the
extension can do is in one place. Items under "Needs Liben's OK" touch a hard rule in `CLAUDE.md`
(new permissions, new dependencies, or sending data somewhere new).

## Done

- [x] Snip a question, draft an answer from your own resume and sources (v1)
- [x] Anthropic and Google Gemini (free tier), bring your own key
- [x] Automatic model fallback when a Gemini model hits its free limit
- [x] Fact check: every sentence checked against your profile
- [x] Fill the whole form at once, with review before insert
- [x] Modern UI, "Made by Liben", Star on GitHub
- [x] Answer confidently: no "I have not worked with X" answers
- [x] Cover letter: your own letter in Settings, and one written per job (Job > Letter)
- [x] Job tab: Letter, Fit, Resume, Interview, and Email for the saved job post
- [x] Job fit check: score, requirements met with evidence, gaps with advice, keywords
- [x] Resume tailoring: your bullets reworded for the job, a tailored summary, skills order
- [x] Interview prep: likely questions with suggested answers; save to the Library
- [x] Follow-up emails: thank-you, follow-up, check-in, accept, decline, withdraw
- [x] Application tracker: status, notes, filters, CSV export, included in backups
- [x] Follow-up radar: last 7 days, reply rate, and applications waiting too long
- [x] Story bank: STAR stories, with suggestions drafted from your resume
- [x] Answer versions: every draft and refinement kept; "Another angle"
- [x] LinkedIn headline options and About section (Profile tab)
- [x] Keyboard shortcuts: Alt+1 to 6, Alt+C, Alt+R, Alt+arrows, and ? for the list
- [x] Scholarship and university forms (Study tab): exact personal details from a verified profile (passport MRZ, codice fiscale check), fitted to each field's format, verified after filling; requirements reader with eligibility checks; Italy guide
- [x] Resume builder (FlowCV style): sections you add, hide, rename, reorder, and duplicate; rich text; full design controls; 8 templates; one or two columns; resume language with the GDPR consent line; PDF export that matches the preview page for page
- [x] One-click tailoring: a Tailor resume button on LinkedIn job pages (and in the side panel for any saved job) makes a two-page copy of your master resume for the job, with a keyword match score, eligibility warnings, everything added listed for you to check, and a cover letter
- [x] Import your resume (PDF, DOCX, TXT) into the builder, word for word, in a Professional template measured from a FlowCV resume

## Next

- [x] Multi-page applications: answers from earlier pages on the same site keep later ones consistent
- [x] Side panel in Amharic, Spanish, and French (follows Chrome's language)
- [ ] Translate the settings pages too
- [x] Firefox build, experimental (`pnpm build:firefox`; the panel is a sidebar)
- [ ] Test the Firefox build in a real Firefox and submit it to addons.mozilla.org
- [x] Sync across devices (opt-in, Chrome Sync): settings, profile, standard answers, stories, cover letter, applications
- [x] Resume builder: per-section settings (new page, heading, list layout, level style), photo crop, portrait shape, black and white, save my own design as a template
- [x] Easy Apply co-pilot: LinkedIn's screening questions answered from your own data (years counted from your dated jobs), the rest drafted, inserted only when you click, and never Next or Submit
- [x] Should I apply: your dealbreakers (where you can work, remote only, sponsorship, pay, title words, companies, words in the post) checked in code before tailoring
- [x] What changed: every difference between the tailored copy and your master, word by word, each with an Undo
- [x] ATS preview: the text an applicant tracking system reads, what it would miss, and a check of the PDF you downloaded
- [ ] Several master resumes (for example ML and backend), picked per job
- [ ] Tailor from any job site with a shortcut (no new permissions)
- [ ] Referral and recruiter messages for a job
- [ ] Work history autofill for Workday, Greenhouse, and Lever
- [ ] Application memory: which resume went to which job, and a warning before applying twice
- [ ] Skills demand map across the jobs you save
- [ ] Interview pack for each application
- [ ] Remote-work helpers: time zone overlap and salary in your currency
- [ ] A quality eval for tailoring (the rules in `src/kb/resume/tailorApply.ts` against real job posts)
- [ ] Hires-from-your-country check: signs in a post that the company can hire where you live (contractor, employer of record, work from anywhere) or can't (must reside in one country)
- [ ] Scam and ghost-job detector: upfront fees, chat-app-only contact, pay too good for the role, vague posts, very old reposts
- [ ] Bullet strengthener: finds bullets with no result or number and asks you questions to fill them in, never inventing
- [ ] Honest gap closer: for must-have skills you lack across saved jobs, a small project that would let you claim the skill truthfully
- [ ] One-page version of any resume, with the keyword-safe trimming
- [ ] Recruiter reply helper: paste a recruiter's message, get replies about availability, salary, and time zone
- [ ] Company brief from the company's own pages: what they do, their stack, three talking points
- [ ] What's working report: which resume versions and keywords got replies, interviews, or rejections
- [ ] Today's apply queue: saved jobs ranked by fit, dealbreakers, and age

## Master's scholarships (Study tab)

- [x] Motivation letter writer: a letter per program from your profile, your own reasons and goals, and the program's page, within the call's word limit, facts only
- [x] Scholarship tracker with deadlines and reminders: track a call from its requirements or add one by hand; closing date, documents, status, notes; a notification 14, 7, 3, and 1 day before it closes
- [ ] Am I eligible, across calls: every saved call checked against your details and ranked
- [ ] Program fit: a program's course page compared with your background and goals
- [ ] Grade conversion to the Italian /110, German, and ECTS scales, formula shown
- [ ] Study plan and research proposal outline
- [ ] Essay reuse and consistency across applications
- [ ] Academic CV template (Europass-style and academic layouts)
- [ ] Supervisor contact email
- [ ] Backwards timeline from a deadline
- [ ] Recommendation letter kit: request emails and a fact sheet for referees
- [ ] Document check: format, size limit, and validity dates against the call

## Needs Liben's OK

- [x] Follow-up reminders as Chrome notifications (approved: `alarms`, `notifications`)
- [x] OpenRouter and Ollama providers (approved; no new manifest permissions needed)
- [x] Resume fonts: FlowCV's list (sans, serif, mono, creative name fonts) and Noto Sans Ethiopic, bundled (approved)
- [ ] LinkedIn profile consistency check: reads your own LinkedIn profile page when you click, to compare titles, dates, and skills with your master resume (reads a LinkedIn page beyond the job post)
- [ ] GitHub evidence import: reads your public repositories through GitHub's API to propose project bullets and skills (a new place requests go)
- [ ] Freelance proposal mode: reads a freelance job post (Upwork and similar) to draft a proposal (a new site to read)
