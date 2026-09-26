import { describe, expect, it } from 'vitest';
import { ApplicantSchema, ageOn, type Applicant } from '@/kb/applicant';
import { checkCharacter, checkCodiceFiscale, nameCode, surnameCode } from '@/kb/codiceFiscale';
import { countryName, findCountry, iso2FromIso3, matchCountryOption } from '@/kb/countries';
import {
  classifyField,
  dateFormat,
  formatDate,
  formatFor,
  looksPersonal,
  monthIndex,
  planForm,
} from '@/kb/identityFill';
import { mrzCheckDigit, parseMrz } from '@/kb/mrz';
import type { FieldInfo } from '@/storage/schema';

const liben: Applicant = ApplicantSchema.parse({
  givenNames: 'Abebe Kebede',
  familyName: 'Tesfaye',
  sex: 'M',
  birthDate: '1999-07-04',
  birthCity: 'Addis Ababa',
  birthCountry: 'ET',
  citizenship: 'ET',
  maritalStatus: 'single',
  fatherName: 'Kebede Tesfaye',
  motherName: 'Almaz Bekele',
  passport: {
    number: 'ep 1234567',
    issueDate: '2022-01-15',
    expiryDate: '2032-01-14',
    issuingCountry: 'ET',
    issuingAuthority: 'Immigration and Citizenship Service',
  },
  codiceFiscale: 'TSFBKB99L04Z315X',
  email: 'abebe@example.com',
  phoneCountry: 'ET',
  phoneNumber: '0911 234 567',
  residence: {
    street: 'Bole Road 12',
    city: 'Addis Ababa',
    region: 'Addis Ababa',
    postalCode: '1000',
    country: 'ET',
  },
  domicile: {
    street: 'Via Roma 5',
    city: 'Padova',
    region: 'PD',
    postalCode: '35122',
    country: 'IT',
  },
  education: [
    {
      level: 'bachelor',
      degree: 'BSc Computer Science',
      field: 'Computer Science',
      institution: 'Addis Ababa University',
      country: 'ET',
      graduationDate: '2021-07-30',
      grade: '3.6',
      gradeScale: '4',
    },
  ],
});

const field = (label: string, extra: Partial<FieldInfo> = {}): FieldInfo => ({
  targetId: label,
  kind: 'input',
  confidence: 'inside',
  label,
  ...extra,
});
const select = (label: string, options: string[], extra: Partial<FieldInfo> = {}): FieldInfo =>
  field(label, { kind: 'select', options, ...extra });

describe('passport MRZ', () => {
  // The ICAO 9303 specimen (the fictional state of Utopia).
  const specimen =
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10';

  it('reads the specimen and verifies every check digit', () => {
    const r = parseMrz(specimen, new Date('2010-01-01'))!;
    expect(r).toMatchObject({
      familyName: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      passportNumber: 'L898902C3',
      birthDate: '1974-08-12',
      sex: 'F',
      expiryDate: '2012-04-15',
      errors: [],
    });
    expect(mrzCheckDigit('L898902C3')).toBe(6);
  });

  it('catches a typo and reads OCR text with spaces', () => {
    const typo = specimen.replace('L898902C3', 'L898902C4');
    expect(parseMrz(typo)!.errors).toContain('passport number');
    const spaced = specimen.replace('\n', '  \n ').replace('ANNA', 'AN NA');
    expect(parseMrz(spaced)?.passportNumber).toBe('L898902C3');
    expect(parseMrz('not a passport')).toBeNull();
  });

  it('maps passport country codes to ISO', () => {
    expect(iso2FromIso3('ETH')).toBe('ET');
    expect(iso2FromIso3('D<<')).toBe('DE');
    expect(iso2FromIso3('ITA')).toBe('IT');
  });
});

describe('codice fiscale', () => {
  it('computes the check character and the name codes', () => {
    // The standard textbook example: Mario Rossi, born 1 January 1980 in Rome.
    expect(checkCharacter('RSSMRA80A01H501')).toBe('U');
    expect(surnameCode('Rossi')).toBe('RSS');
    expect(nameCode('Mario')).toBe('MRA');
    expect(nameCode('Gianfranco')).toBe('GFR');
    expect(surnameCode('Fo')).toBe('FOX');
  });

  it('checks a code against the person', () => {
    const ok = checkCodiceFiscale('RSSMRA80A01H501U', {
      familyName: 'Rossi',
      givenNames: 'Mario',
      birthDate: '1980-01-01',
      sex: 'M',
    });
    expect(ok).toEqual({ valid: true, problems: [], bornAbroad: false });
    const wrong = checkCodiceFiscale('RSSMRA80A41H501U', { birthDate: '1980-01-01', sex: 'M' });
    expect(wrong.valid).toBe(false);
    expect(wrong.problems.join(' ')).toMatch(/check character|birth day/);
    expect(checkCodiceFiscale('12345').valid).toBe(false);
    const cf = `TSFBKB99L04Z315`;
    expect(
      checkCodiceFiscale(cf + checkCharacter(cf), {
        familyName: 'Tesfaye',
        givenNames: 'Abebe Kebede',
        birthDate: '1999-07-04',
        sex: 'M',
      }),
    ).toMatchObject({ valid: true, bornAbroad: true });
  });
});

describe('countries', () => {
  it('matches dropdowns by name in any language, code, or value', () => {
    expect(matchCountryOption('ET', ['Select', 'Eritrea', 'Etiopia', 'Italia'])).toBe(2);
    expect(matchCountryOption('ET', ['--', 'ER', 'ET', 'IT'])).toBe(2);
    expect(matchCountryOption('ET', ['--', 'Eritrea', 'Ethiopia'], ['', '232', '231'])).toBe(2);
    expect(matchCountryOption('IT', ['France', 'Italy'], ['FRA', 'ITA'])).toBe(1);
    expect(matchCountryOption('IT', ['A', 'B'], ['FR', 'IT'])).toBe(1);
    expect(matchCountryOption('ET', ['Ethiopian', 'Eritrean'])).toBe(0);
    expect(matchCountryOption('ET', ['+251 Ethiopia', '+39 Italy'])).toBe(0);
    expect(matchCountryOption('ET', ['ETIOPIA (ETH)', 'ITALIA (ITA)'])).toBe(0);
    // Niger is not Nigeria.
    expect(matchCountryOption('NE', ['Nigeria', 'Niger'])).toBe(1);
    expect(matchCountryOption('XK', ['Kosovo'])).toBe(0);
  });

  it('reads countries from free text', () => {
    expect(findCountry('Etiopia')).toBe('ET');
    expect(findCountry('ETH')).toBe('ET');
    expect(findCountry('Ethiopian')).toBe('ET');
    expect(countryName('ET', 'it')).toBe('Etiopia');
  });
});

describe('dates', () => {
  it('reads the format from the field', () => {
    expect(dateFormat(field('Birth date', { inputType: 'date' }))).toMatchObject({
      native: 'date',
      sure: true,
    });
    expect(dateFormat(field('Data di nascita', { placeholder: 'gg/mm/aaaa' }))).toMatchObject({
      order: 'DMY',
      sep: '/',
      sure: true,
    });
    expect(dateFormat(field('Date of birth', { hint: 'Format: MM/DD/YYYY' }))).toMatchObject({
      order: 'MDY',
      sure: true,
    });
    expect(dateFormat(field('Geburtsdatum', { placeholder: 'TT.MM.JJJJ' }))).toMatchObject({
      order: 'DMY',
      sep: '.',
      sure: true,
    });
    expect(dateFormat(field('Date', { placeholder: 'e.g. 31/12/2000' }))).toMatchObject({
      order: 'DMY',
      sure: true,
    });
    expect(dateFormat(field('Date', { placeholder: '2000-12-31' }))).toMatchObject({
      order: 'YMD',
      sep: '-',
      sure: true,
    });
    expect(dateFormat(field('Date'), { lang: 'en-US', hostname: 'x.com' })).toMatchObject({
      order: 'MDY',
      sure: false,
    });
    expect(dateFormat(field('Date'), { lang: 'it', hostname: 'unipd.it' })).toMatchObject({
      order: 'DMY',
      sure: false,
    });
  });

  it('formats and reads month names', () => {
    expect(formatDate('1999-07-04', { order: 'DMY', sep: '/', yy: false, sure: true })).toBe(
      '04/07/1999',
    );
    expect(formatDate('1999-07-04', { order: 'MDY', sep: '-', yy: true, sure: true })).toBe(
      '07-04-99',
    );
    expect(monthIndex('Luglio')).toBe(6);
    expect(monthIndex('Jul')).toBe(6);
    expect(monthIndex('juillet')).toBe(6);
    expect(monthIndex('Septiembre')).toBe(8);
    expect(ageOn('1999-07-04', '2026-07-03')).toBe(26);
    expect(ageOn('1999-07-04', '2026-07-04')).toBe(27);
  });
});

/** Run a whole form through the planner; returns label -> value (or issue). */
function fill(fields: FieldInfo[], page = { lang: 'en', hostname: 'apply.example.edu' }) {
  return Object.fromEntries(
    planForm(fields, liben, page, new Date('2026-09-26')).map((p) => [
      `${p.field.section ? `${p.field.section} / ` : ''}${p.field.label || p.field.name}`,
      p.fill ? p.fill.value || `!${p.fill.issues.join(',')}` : p.personal ? '(personal)' : null,
    ]),
  );
}

describe('DreamApply-style profile (English)', () => {
  it('fills every personal field exactly', () => {
    expect(
      fill([
        field('First name(s)', { autocomplete: 'given-name', name: 'first_name' }),
        field('Last name(s)', { autocomplete: 'family-name', name: 'last_name' }),
        select('Gender', ['', 'Female', 'Male', 'Other']),
        field('Date of birth', { inputType: 'date', name: 'dob' }),
        select('Country of birth', ['Choose…', 'Eritrea', 'Ethiopia', 'Italy']),
        field('Place of birth', { name: 'birth_place' }),
        select('Citizenship', ['Choose…', 'Eritrea', 'Ethiopia', 'Italy'], {
          optionValues: ['', 'ER', 'ET', 'IT'],
        }),
        field('Passport number', { section: 'Identity document' }),
        field('Date of issue', { inputType: 'date', section: 'Identity document' }),
        field('Expiry date', { inputType: 'date', section: 'Identity document' }),
        field('E-mail', { inputType: 'email' }),
        field('Phone', { inputType: 'tel', placeholder: '+1 555 0100' }),
        field('Street address', { section: 'Home address' }),
        field('City', { section: 'Home address' }),
        field('Postal code', { section: 'Home address' }),
        select('Country', ['Ethiopia', 'Italy'], { section: 'Home address' }),
      ]),
    ).toEqual({
      'First name(s)': 'Abebe Kebede',
      'Last name(s)': 'Tesfaye',
      Gender: 'Male',
      'Date of birth': '1999-07-04',
      'Country of birth': 'Ethiopia',
      'Place of birth': 'Addis Ababa',
      Citizenship: 'Ethiopia',
      'Identity document / Passport number': 'EP1234567',
      'Identity document / Date of issue': '2022-01-15',
      'Identity document / Expiry date': '2032-01-14',
      'E-mail': 'abebe@example.com',
      Phone: '+251 911234567',
      'Home address / Street address': 'Bole Road 12',
      'Home address / City': 'Addis Ababa',
      'Home address / Postal code': '1000',
      'Home address / Country': 'Ethiopia',
    });
  });
});

describe('Italian university form (Universitaly style)', () => {
  it('reads Italian labels, split dates, and the phone prefix', () => {
    expect(
      fill(
        [
          field('Cognome', { hint: 'in stampatello, come sul passaporto' }),
          field('Nome', { hint: 'in stampatello, come sul passaporto' }),
          select('Sesso', ['--', 'M', 'F']),
          select('Data di nascita', [
            'Giorno',
            ...Array.from({ length: 31 }, (_, i) => String(i + 1)),
          ]),
          select(
            '',
            [
              'Mese',
              'Gennaio',
              'Febbraio',
              'Marzo',
              'Aprile',
              'Maggio',
              'Giugno',
              'Luglio',
              'Agosto',
              'Settembre',
              'Ottobre',
              'Novembre',
              'Dicembre',
            ],
            { name: 'nascita_mese' },
          ),
          select('', ['Anno', ...Array.from({ length: 60 }, (_, i) => String(2010 - i))], {
            name: 'nascita_anno',
          }),
          select('Stato di nascita', ['ERITREA', 'ETIOPIA', 'ITALIA']),
          field('Comune / città di nascita'),
          select('Cittadinanza', ['ERITREA', 'ETIOPIA', 'ITALIA']),
          field('Codice fiscale', { maxLength: 16 }),
          field('Numero', { section: 'Passaporto' }),
          field('Data rilascio', { placeholder: 'gg/mm/aaaa', section: 'Passaporto' }),
          field('Data scadenza', { placeholder: 'gg/mm/aaaa', section: 'Passaporto' }),
          field('Ente di rilascio', { section: 'Passaporto' }),
          field('Indirizzo', { section: 'Domicilio in Italia' }),
          field('CAP', { section: 'Domicilio in Italia' }),
          field('Città', { section: 'Domicilio in Italia' }),
          field('Provincia', { section: 'Domicilio in Italia' }),
          select('Prefisso', ['+39', '+251', '+291']),
          field('Cellulare', { inputType: 'tel' }),
          field('Nome', { section: 'Dati del padre' }),
          field('Nome', { section: 'Dati della madre' }),
        ],
        { lang: 'it', hostname: 'www.universitaly.it' },
      ),
    ).toEqual({
      Cognome: 'TESFAYE',
      Nome: 'ABEBE KEBEDE',
      Sesso: 'M',
      'Data di nascita': '4',
      nascita_mese: 'Luglio',
      nascita_anno: '1999',
      'Stato di nascita': 'ETIOPIA',
      'Comune / città di nascita': 'Addis Ababa',
      Cittadinanza: 'ETIOPIA',
      'Codice fiscale': 'TSFBKB99L04Z315X',
      'Passaporto / Numero': 'EP1234567',
      'Passaporto / Data rilascio': '15/01/2022',
      'Passaporto / Data scadenza': '14/01/2032',
      'Passaporto / Ente di rilascio': 'Immigration and Citizenship Service',
      'Domicilio in Italia / Indirizzo': 'Via Roma 5',
      'Domicilio in Italia / CAP': '35122',
      'Domicilio in Italia / Città': 'Padova',
      'Domicilio in Italia / Provincia': 'PD',
      Prefisso: '+251',
      Cellulare: '911234567',
      'Dati del padre / Nome': 'Kebede Tesfaye',
      'Dati della madre / Nome': 'Almaz Bekele',
    });
  });
});

describe('edge cases', () => {
  it('bare "Name" is the full name, or the first name next to a surname field', () => {
    expect(fill([field('Name')])).toEqual({ Name: 'Abebe Kebede Tesfaye' });
    expect(fill([field('Name'), field('Surname')])).toEqual({
      Name: 'Abebe Kebede',
      Surname: 'Tesfaye',
    });
    expect(fill([field('Cognome e nome')])).toEqual({ 'Cognome e nome': 'Tesfaye Abebe Kebede' });
  });

  it("never fills a referee's or emergency contact's details with the applicant's", () => {
    expect(classifyField(field('Full name', { section: 'Referee 1' }))).toBeNull();
    expect(classifyField(field('Email', { section: 'Emergency contact' }))).toBeNull();
    expect(classifyField(field("Father's name"))).toMatchObject({ key: 'fatherName' });
  });

  it('flags limits, patterns, missing data, and guessed formats instead of forcing a value', () => {
    const tooShort = formatFor(
      field('Passport number', { maxLength: 7 }),
      { key: 'passportNumber', confidence: 'exact' },
      liben,
    );
    expect(tooShort.issues).toContain('too-long');
    const pattern = formatFor(
      field('Passport number', { pattern: '[A-Z]{2}[0-9]{6}' }),
      { key: 'passportNumber', confidence: 'exact' },
      liben,
    );
    expect(pattern.issues).toContain('pattern');
    const missing = formatFor(
      field('National ID'),
      { key: 'nationalId', confidence: 'exact' },
      liben,
    );
    expect(missing).toMatchObject({ missing: true, issues: ['missing'] });
    const guessed = formatFor(
      field('Date of birth'),
      { key: 'birthDate', confidence: 'exact' },
      liben,
      { lang: 'en', hostname: 'x.org' },
    );
    expect(guessed).toMatchObject({ value: '04/07/1999', formatGuessed: true });
    const noOption = formatFor(
      select('Citizenship', ['France', 'Spain']),
      { key: 'citizenship', confidence: 'exact' },
      liben,
    );
    expect(noOption.issues).toEqual(['no-option']);
  });

  it('keeps essay questions for the AI and personal ones away from it', () => {
    expect(
      classifyField(field('Why do you want to study at our university?', { kind: 'textarea' })),
    ).toBeNull();
    expect(looksPersonal(field('Residence permit number'))).toBe(true);
    expect(looksPersonal(field('Why this program?'))).toBe(false);
  });

  it('uses the nationality word when an English form asks for nationality in a text box', () => {
    expect(fill([field('Nationality')])).toEqual({ Nationality: 'Ethiopian' });
    expect(fill([field('Cittadinanza')], { lang: 'it', hostname: 'x.it' })).toEqual({
      Cittadinanza: 'Etiopia',
    });
  });

  it('fills education facts from the latest degree', () => {
    expect(
      fill([
        field('Name of university', { section: 'Previous education' }),
        field('GPA', { section: 'Previous education' }),
        field('Grading scale (maximum)', { section: 'Previous education' }),
        field('Graduation date', { placeholder: 'dd/mm/yyyy', section: 'Previous education' }),
      ]),
    ).toEqual({
      'Previous education / Name of university': 'Addis Ababa University',
      'Previous education / GPA': '3.6',
      'Previous education / Grading scale (maximum)': '4',
      'Previous education / Graduation date': '30/07/2021',
    });
  });
});

describe('Esse3-style portal (from the research: UNIVPM, Sapienza, Padua)', () => {
  it('reads birth fields by position, skips traps, and answers the yes/no questions', () => {
    const cfBox: FieldInfo = {
      targetId: 'nocf',
      kind: 'checkbox-group',
      confidence: 'inside',
      label: 'Studente straniero senza Codice Fiscale Italiano',
      options: ['Studente straniero senza Codice Fiscale Italiano'],
    };
    expect(
      fill(
        [
          cfBox,
          field('Nome', { section: 'Dati personali' }),
          field('Cognome', { section: 'Dati personali' }),
          field('Data Nascita', { placeholder: 'gg/MM/yyyy', section: 'Dati personali' }),
          select('Sesso', ['Maschio', 'Femmina'], {
            kind: 'radio-group',
            section: 'Dati personali',
          }),
          select('Prima cittadinanza', ['ERITREA', 'ETIOPIA', 'ITALIA'], {
            section: 'Dati personali',
          }),
          select('Nazione', ['ERITREA', "REPUBBLICA FEDERALE DEMOCRATICA D'ETIOPIA", 'ITALIA'], {
            section: 'Dati personali',
          }),
          field('Provincia', { section: 'Dati personali' }),
          field('Comune/Città', { section: 'Dati personali' }),
          select('Tipo documento', ["Carta d'identità", 'Passaporto', 'Patente'], {
            section: 'Documento di identità',
          }),
          field('Numero', { section: 'Documento di identità' }),
          field('Rilasciato da', { section: 'Documento di identità' }),
          field('Data Scadenza Validità', {
            placeholder: 'gg/mm/aaaa',
            section: 'Documento di identità',
          }),
          field('Indirizzo', { section: 'Residenza' }),
          field('N° Civico', { section: 'Residenza' }),
          select('Domicilio coincide con residenza', ['Sì', 'No'], {
            kind: 'radio-group',
            section: 'Residenza',
          }),
          field('E-mail', { section: 'Recapito' }),
          field('E-mail certificata', { section: 'Recapito' }),
          field('Pref. Internazionale', { section: 'Recapito' }),
          field('Cellulare', { maxLength: 17, section: 'Recapito' }),
        ],
        { lang: 'it', hostname: 'esse3.univpm.it' },
      ),
    ).toEqual({
      'Studente straniero senza Codice Fiscale Italiano': '!',
      'Dati personali / Nome': 'Abebe Kebede',
      'Dati personali / Cognome': 'Tesfaye',
      'Dati personali / Data Nascita': '04/07/1999',
      'Dati personali / Sesso': 'Maschio',
      'Dati personali / Prima cittadinanza': 'ETIOPIA',
      'Dati personali / Nazione': "REPUBBLICA FEDERALE DEMOCRATICA D'ETIOPIA",
      'Dati personali / Provincia': '(personal)',
      'Dati personali / Comune/Città': 'Addis Ababa',
      'Documento di identità / Tipo documento': 'Passaporto',
      'Documento di identità / Numero': 'EP1234567',
      'Documento di identità / Rilasciato da': 'Immigration and Citizenship Service',
      'Documento di identità / Data Scadenza Validità': '14/01/2032',
      'Residenza / Indirizzo': 'Bole Road',
      'Residenza / N° Civico': '12',
      'Residenza / Domicilio coincide con residenza': 'No',
      'Recapito / E-mail': 'abebe@example.com',
      'Recapito / E-mail certificata': '(personal)',
      'Recapito / Pref. Internazionale': '+251',
      'Recapito / Cellulare': '911234567',
    });
  });

  it('DreamApply: leaves middle and previous names, fills double citizenship and house number', () => {
    const plan = planForm(
      [
        field('Given name'),
        field('Middle name'),
        field('Family name'),
        field('Previous family name'),
        select('Double citizenship', ['None', 'Ethiopia', 'Italy']),
        field('Street address', { section: 'Contacts' }),
        field('House number', { section: 'Contacts' }),
      ],
      { ...liben, secondCitizenship: 'IT' },
      { lang: 'en', hostname: 'apply.unipd.it' },
    );
    expect(plan.map((p) => p.fill?.value ?? (p.personal ? 'personal' : 'ai'))).toEqual([
      'Abebe Kebede',
      'personal',
      'Tesfaye',
      'personal',
      'Italy',
      'Bole Road',
      '12',
    ]);
  });

  it('ticks "no codice fiscale" only when there is none, and strips accents from passport names', () => {
    const box: FieldInfo = {
      targetId: 'b',
      kind: 'checkbox-group',
      confidence: 'inside',
      label: 'I do not have an Italian tax code',
      options: ['I do not have an Italian tax code'],
    };
    const without = planForm([box], { ...liben, codiceFiscale: '' });
    expect(without[0]!.fill?.value).toBe('I do not have an Italian tax code');
    expect(planForm([box], liben)[0]!.fill).toMatchObject({ skip: true });
    const accented = { ...liben, givenNames: 'José', familyName: 'Müller' };
    const names = planForm(
      [field('Name (as in passport)'), field('Surname', { hint: 'without accents' })],
      accented,
    );
    expect(names.map((p) => p.fill?.value)).toEqual(['Jose', 'Muller']);
  });
});
