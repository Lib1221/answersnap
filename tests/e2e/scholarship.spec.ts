import type { Page } from '@playwright/test';
import { expect, FIXTURES, mockLog, saveJob, seed, test } from './fixtures';

const APPLICANT = {
  givenNames: 'Abebe Kebede',
  familyName: 'Tesfaye',
  sex: 'M',
  birthDate: '1999-07-04',
  birthCity: 'Addis Ababa',
  birthCountry: 'ET',
  citizenship: 'ET',
  passport: {
    number: 'EP1234567',
    issueDate: '2022-01-15',
    expiryDate: '2032-01-14',
    issuingCountry: 'ET',
    issuingAuthority: 'ICS',
  },
  codiceFiscale: 'TSFBKB99L04Z315',
  email: 'abebe@example.com',
  phoneCountry: 'ET',
  phoneNumber: '0911234567',
  residence: {
    street: 'Bole Road 12',
    city: 'Addis Ababa',
    region: '',
    postalCode: '1000',
    country: 'ET',
  },
  languageTests: [{ test: 'IELTS Academic', score: '7.0', date: '', level: 'C1' }],
};

async function seedApplicant(panel: Page) {
  await panel.evaluate(async (a) => {
    // A valid check character for the test code.
    await chrome.storage.local.set({ applicant: { ...a, codiceFiscale: `${a.codiceFiscale}R` } });
  }, APPLICANT);
}

async function openScholarship(panel: Page) {
  await panel.bringToFront();
  await panel.getByRole('tab', { name: 'Study' }).click();
}

test('DreamApply-style form: exact personal details, verified, and never sent to the AI', async ({
  context,
  panel,
}) => {
  await seed(panel);
  await seedApplicant(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/scholarship-en.html`);
  await openScholarship(panel);
  // The form is the active tab when scanning (the panel is a tab of its own in tests).
  await page.bringToFront();
  await panel.getByTestId('sch-scan').click();
  await expect(panel.getByTestId('sch-detail-rows')).toBeVisible();

  // Middle name, previous family name, and the emergency contact stay with the applicant.
  const you = panel.getByTestId('sch-you');
  for (const label of ['Middle name', 'Previous family name', 'Full name', 'Phone'])
    await expect(you).toContainText(label);
  await expect(panel.getByTestId('sch-uploads')).toContainText('Copy of passport');
  await expect(panel.getByTestId('sch-uploads')).toContainText('required');

  await panel.getByTestId('sch-draft').click();
  await expect(panel.getByTestId('sch-essays').locator('textarea')).toHaveValue(/\S/);
  await panel.getByTestId('sch-insert').click();
  await expect(panel.getByTestId('sch-summary')).toContainText('verified on the page');
  await expect(panel.getByTestId('sch-summary')).not.toContainText('need a look');

  const values = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('input:not([type=file]), select, textarea')].map((el) => [
        el.id,
        (el as HTMLInputElement).value,
      ]),
    ),
  );
  expect(values).toMatchObject({
    gn: 'Abebe Kebede',
    mn: '',
    fn: 'Tesfaye',
    pfn: '',
    gender: 'M',
    cit: 'ET',
    doctype: 'Passport',
    docno: 'EP1234567',
    issue: '2022-01-15',
    expiry: '2032-01-14',
    doccountry: 'ET',
    dob: '1999-07-04',
    cob: 'ET',
    pob: 'Addis Ababa',
    street: 'Bole Road',
    house: '12',
    city: 'Addis Ababa',
    zip: '1000',
    country: 'ET',
    mobile: '+251 911234567',
    email: 'abebe@example.com',
    'ec-name': '',
    'ec-phone': '',
  });
  // The essay came from the resume via the AI, and landed in the text box.
  expect(values.why!.length).toBeGreaterThan(10);

  // Nothing personal reached the AI: the essay request carries the resume, not the passport.
  const sent = JSON.stringify(await mockLog());
  for (const secret of ['EP1234567', '1999-07-04', '04/07/1999', 'TSFBKB99L04Z315', '911234567'])
    expect(sent).not.toContain(secret);
});

test('Italian portal: split date dropdowns, Italian country names, prefix, and the traps', async ({
  context,
  panel,
}) => {
  await seed(panel);
  await seedApplicant(panel);
  const page = await context.newPage();
  await page.goto(`${FIXTURES}/scholarship-it.html`);
  await openScholarship(panel);
  // The form is the active tab when scanning (the panel is a tab of its own in tests).
  await page.bringToFront();
  await panel.getByTestId('sch-scan').click();
  await expect(panel.getByTestId('sch-detail-rows')).toBeVisible();
  await panel.getByTestId('sch-insert').click();
  await expect(panel.getByTestId('sch-summary')).toContainText('verified on the page');

  const values = await page.evaluate(() => ({
    ...Object.fromEntries(
      [...document.querySelectorAll('input:not([type=radio]), select')].map((el) => [
        el.id,
        (el as HTMLInputElement).value,
      ]),
    ),
    sesso: (document.querySelector('input[name=sesso]:checked') as HTMLInputElement | null)?.value,
  }));
  expect(values).toMatchObject({
    cognome: 'Tesfaye',
    nome: 'Abebe Kebede',
    sesso: 'M',
    gg: '4',
    mm: 'Luglio',
    aaaa: '1999',
    nazione: "REPUBBLICA FEDERALE DEMOCRATICA D'ETIOPIA",
    prov: '',
    comune: 'Addis Ababa',
    citt: 'ETIOPIA',
    cf: 'TSFBKB99L04Z315R',
    tipo: 'Passaporto',
    numdoc: 'EP1234567',
    ril: '15/01/2022',
    scad: '14/01/2032',
    mail: 'abebe@example.com',
    pec: '',
    pref: '+251',
    cell: '911234567',
  });
});

test('requirements: deadlines, age and language checked against your details, documents checklist', async ({
  context,
  panel,
}) => {
  await seed(panel);
  await seedApplicant(panel);
  await saveJob(panel, context, 'scholarship-call.html');
  await openScholarship(panel);
  await panel.getByRole('button', { name: 'Requirements' }).click();
  await panel.getByTestId('sch-req-run').click();
  await expect(panel.getByTestId('sch-req-program')).toContainText(
    'Padua International Excellence',
  );
  const checks = panel.getByTestId('sch-checks');
  await expect(checks).toContainText('Age limit 29: you will be 27 on 2027-03-15.');
  await expect(checks).toContainText('IELTS 6.5 required; yours: IELTS Academic 7.0.');
  await expect(checks).toContainText('Passport valid until 2032-01-14');
  await expect(checks).toContainText('Applications close: 2027-03-15, in');

  const docs = panel.getByTestId('sch-docs');
  await expect(docs).toContainText('Documents (0 of 3 ready)');
  await docs.getByText('Copy of passport').click();
  await expect(docs).toContainText('Documents (1 of 3 ready)');
  // The page text went to the AI; the applicant's details did not.
  const sent = JSON.stringify(await mockLog());
  expect(sent).toContain('Padua International Excellence Scholarship');
  expect(sent).not.toContain('EP1234567');

  await panel.getByRole('button', { name: 'Italy guide' }).click();
  await expect(panel.getByTestId('sch-guide').first()).toContainText('Universitaly');
});

test('Applicant details: read a passport MRZ and check the codice fiscale', async ({
  context,
  extensionId,
  panel,
}) => {
  await seed(panel);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#applicant`);
  await options
    .getByTestId('mrz-input')
    .fill(
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10',
    );
  await options.getByTestId('mrz-read').click();
  await expect(options.getByTestId('mrz-ok')).toContainText(
    'ERIKSSON ANNA MARIA, passport L898902C3',
  );
  await expect(options.getByTestId('ap-family')).toHaveValue('Eriksson');
  await expect(options.getByTestId('ap-given')).toHaveValue('Anna Maria');
  await expect(options.getByTestId('ap-passport')).toHaveValue('L898902C3');
  await expect(options.getByTestId('ap-dob')).toHaveValue('1974-08-12');

  await options.getByTestId('ap-cf').fill('RSSMRA80A01H501X');
  await expect(options.getByTestId('cf-bad')).toContainText('check character');
  await options.getByTestId('applicant-save').click();
  await expect(options.getByRole('status')).toHaveText('Saved');
  const stored = await options.evaluate(
    async () => (await chrome.storage.local.get('applicant')).applicant,
  );
  expect(stored).toMatchObject({ familyName: 'Eriksson', passport: { number: 'L898902C3' } });
  // Personal details never sync.
  expect(JSON.stringify(await options.evaluate(() => chrome.storage.sync.get(null)))).not.toContain(
    'L898902C3',
  );
});
