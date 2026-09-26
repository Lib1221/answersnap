# Chrome Web Store listing

## Listing

- **Name:** AnswerSnap
- **Summary (132 characters max):** Snip any application question and get a draft answer written from your own resume and website. You review, then insert.
- **Category:** Productivity (closest subcategory offered, such as Tools or Workflow)
- **Assets:** 128 x 128 icon (`icons/128.png` from the build), screenshots in `docs/store/`
  (1280 x 800), small promo tile `docs/store/promo-440x280.png`.

### Description

```
Job and freelance applications ask the same questions again and again. AnswerSnap drafts the answers from what you already wrote.

How it works
1. Add your resume and your website once.
2. On any application form, press Alt+Shift+Q and drag around a question.
3. A draft answer appears in the side panel, written only from your own information.
4. Edit it if you want, then insert it into the field or copy it.

What makes it different
- It never makes things up. If a question needs something you haven't provided, like your rate, it leaves a clear placeholder.
- It respects character and word limits.
- It writes like a person, not like a chatbot.
- It never submits anything for you.

Privacy
Your resume, profile, and saved answers stay in your browser. When you snip a question, the selected region and your profile are sent to the AI provider you configure (Anthropic or Google Gemini), using your own API key. Nothing is sent anywhere else.

You need an Anthropic or Google Gemini API key to use AnswerSnap. Gemini's free tier works.
```

## Privacy tab

- **Single purpose:** Drafts answers to application questions using the user's own resume and
  website content.
- **Permission justifications:**
  - `activeTab`: Takes a screenshot of, and reads, the current tab only after the user invokes the extension (shortcut, toolbar icon, or context menu).
  - `scripting`: Injects the selection overlay into the current tab when the user starts a snip.
  - `storage`: Keeps settings, the user's profile, and saved answers locally in the browser.
  - `sidePanel`: Shows the answer workspace next to the form.
  - `contextMenus`: Adds right-click entries: Snip question, Answer this field, Use selection as job post, Import this page.
  - `alarms`: Checks the user's local application tracker a few times a day for applications with no news, to remind them to follow up. Can be turned off.
  - `notifications`: Shows that follow-up reminder. Nothing is sent anywhere; the check reads local storage only.
  - Host `https://api.anthropic.com/*`: Sends the question and the user's profile to the AI provider the user configured.
  - Optional `<all_urls>`: Requested at runtime only, per site, to import the user's own website, or, if the user opts in, to snip from the panel on any site.
- **Remote code:** No.
- **Data usage (declare, matching the form's current wording):**
  - Personally identifiable information: name, email, work history from the resume.
  - Website content: text and screenshot of the region the user selects.
  - Authentication information: the user's own API key, stored locally.
- **Certify:** not sold to third parties; not used or transferred for purposes unrelated to the
  single purpose; not used for creditworthiness or lending.
- **Privacy policy URL:** host `docs/PRIVACY.md` publicly (GitHub Pages, or a page on your site)
  and paste its URL.

## Publishing steps (spec 18.1)

1. Register a Chrome Web Store developer account (one-time $5 fee). Use the email you want to keep;
   it can't be changed later.
2. Host the privacy policy at a public URL and fill in the contact line in `docs/PRIVACY.md`.
3. `pnpm zip`, then upload `.output/answersnap-<version>-chrome.zip` in the developer dashboard.
4. Fill in the listing, privacy tab, and distribution from this file.
5. Submit. Narrow permissions (activeTab plus one API host) help review.
6. Updates: bump the version in `package.json`, `pnpm zip`, upload. Pushing a `v*` tag runs the
   release workflow, which builds the zip too.
