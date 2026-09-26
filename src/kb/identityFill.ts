import type { FieldInfo, PageInfo } from '@/storage/schema';
import { ageOn, latestEducation, type Address, type Applicant } from './applicant';
import { countryByIso2, countryName, matchCountryOption, normalizeText } from './countries';

// Exact filling for scholarship and university forms. Each field is classified from several
// independent signals (autocomplete, name/id, label in five languages, section heading, and its
// neighbors), then its value is formatted the way that field expects (date order, dropdown
// option, code or name, casing) and checked against the field's own limits. Personal data never
// goes to the AI: it's copied from the applicant's details, or the field is flagged.

export type IdKey =
  | 'givenNames'
  | 'familyName'
  | 'fullName'
  | 'sex'
  | 'birthDate'
  | 'birthCity'
  | 'birthCountry'
  | 'citizenship'
  | 'secondCitizenship'
  | 'maritalStatus'
  | 'fatherName'
  | 'motherName'
  | 'nativeLanguage'
  | 'passportNumber'
  | 'passportIssueDate'
  | 'passportExpiryDate'
  | 'passportIssuingCountry'
  | 'passportIssuingAuthority'
  | 'nationalId'
  | 'codiceFiscale'
  | 'email'
  | 'phone'
  | 'phoneCountryCode'
  | 'phoneNational'
  | 'street'
  | 'city'
  | 'region'
  | 'postalCode'
  | 'country'
  | 'institution'
  | 'degree'
  | 'fieldOfStudy'
  | 'graduationDate'
  | 'grade'
  | 'gradeScale'
  | 'eduCountry'
  | 'age'
  | 'houseNumber'
  | 'documentType'
  | 'domicileSame'
  | 'noCodiceFiscale';

export type DatePart = 'day' | 'month' | 'year';
const DATE_KEYS: IdKey[] = [
  'birthDate',
  'passportIssueDate',
  'passportExpiryDate',
  'graduationDate',
];
const COUNTRY_KEYS: IdKey[] = [
  'birthCountry',
  'citizenship',
  'secondCitizenship',
  'passportIssuingCountry',
  'country',
  'eduCountry',
];

export interface Classification {
  key: IdKey;
  part?: DatePart;
  address?: 'residence' | 'domicile';
  /** exact: an unambiguous signal (autocomplete, a specific label). likely: inferred. */
  confidence: 'exact' | 'likely';
}

// ---------------------------------------------------------------------------------------------
// Signals

/** "dateOfBirth", "passport_no", "birth-date" -> "date of birth", "passport no", "birth date". */
export function attrWords(s = ''): string {
  return normalizeText(
    s
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-[\].:]+/g, ' ')
      .replace(/\d+/g, ' '),
  );
}

interface Signals {
  /** Label, placeholder, and hint. */
  label: string;
  /** The label alone: read first, since hints mention other things ("as on your passport"). */
  primary: string;
  /** Placeholder and hint. */
  extra: string;
  /** name and id attributes, split into words. */
  attr: string;
  section: string;
  ac: string;
  all: string;
}

function signals(f: FieldInfo): Signals {
  const primary = normalizeText(f.label ?? '');
  const extra = normalizeText([f.placeholder, f.hint].filter(Boolean).join(' '));
  const label = `${primary} ${extra}`.trim();
  const attr = attrWords(`${f.name ?? ''} ${f.domId ?? ''}`);
  const section = normalizeText(f.section ?? '');
  return {
    label,
    primary,
    extra,
    attr,
    section,
    ac: (f.autocomplete ?? '').toLowerCase(),
    all: `${label} ${attr}`,
  };
}

const re = (s: string) => new RegExp(`(^| )(${s})( |$)`);

// Words for other people: their names and details are not the applicant's.
const OTHER_PERSON = re(
  'father|mother|parent|parents|guardian|spouse|husband|wife|partner|emergency|referee|recommender|reference|sponsor|contact person|next of kin|padre|madre|genitore|genitori|coniuge|tutore|pere|mere|parent|conjoint|tuteur|vater|mutter|ehepartner',
);
const FATHER = re('father|padre|pere|vater|paternal');
const MOTHER = re('mother|madre|mere|mutter|maternal');
const PASSPORT = re('passport|passaporto|passeport|pasaporte|reisepass|pass');
const DOMICILE = re(
  'domicile|domicilio|current address|present address|correspondence|mailing|postal address|recapito|temporary|in italy|in italia|adresse actuelle',
);
const EDUCATION = re(
  'education|educational|academic|degree|studies|university|previous studies|qualification|titolo di studio|titoli|istruzione|carriera|formazione|conseguimento|voto|laurea|etudes|formation|estudios|ausbildung|studium',
);

/** Fields that look like ours but aren't: never filled, never sent to the AI. */
const SKIP = [
  re(
    'previous|former|maiden|birth name|other names?|alias|nome precedente|cognome precedente|nom de jeune fille',
  ),
  re('middle names?|secondo nome|second name'),
  re('certificata|pec|certified e ?mail'),
  re(
    'provincia di nascita|birth district|birth province|district of birth|province of birth|region of birth|cap di nascita',
  ),
  re(
    'frazione|additional address|address line 2|address 2|c o|presso|care of|apartment|suite|interno|scala',
  ),
  re('citizenship 3|nationality 3|cittadinanza 3|third citizenship|terza cittadinanza'),
];
const NAME_WORD = re('name|names|nome|cognome|nom|prenom|nombre|apellido|surname|vorname|nachname');
const ADDRESS = re(
  'address|residence|residenza|domicilio|domicile|home|contact|contacts|recapito|recapiti|indirizzo|adresse|direccion|anschrift|mailing|where you live',
);

const DOCUMENT = re(
  'document|documento|identity|identita|identification|passport|passaporto|piece d identite',
);

const DAY = re('day|dd|giorno|gg|jour|jj|dia|tag|tt');
const MONTH = re('month|mm|mese|mois|mes|monat');
const YEAR = re('year|yyyy|yy|anno|aaaa|annee|ano|jahr|jjjj');

/** Label patterns, most specific first. `ctx` narrows a generic label to a document. */
const RULES: { key: IdKey; label: RegExp; attr?: RegExp }[] = [
  {
    key: 'domicileSame',
    label: re(
      'domicilio coincide con (la )?residenza|domicilio uguale (alla )?residenza|domicile (is )?(the )?same as (my )?residence|same as (home|residence|permanent) address|current address (is )?(the )?same( as)?',
    ),
  },
  {
    key: 'noCodiceFiscale',
    label: re(
      'senza codice fiscale|senza cf|without (an )?italian (tax|fiscal) code|no italian (tax|fiscal) code|i do not have (an )?italian (tax|fiscal) code|non ho (il )?codice fiscale|non possiedo (il )?codice fiscale',
    ),
  },
  {
    key: 'documentType',
    label: re(
      'document type|type of (id |identity |identification )?document|id type|identity document type|tipo (di )?documento|type de (piece|document)|tipo de documento|dokumententyp',
    ),
  },
  {
    key: 'houseNumber',
    label: re(
      'house (number|no|nr)|street (number|no)|building number|n civico|numero civico|civico|num civico|house',
    ),
  },
  {
    key: 'codiceFiscale',
    label: re(
      'codice fiscale|cod fiscale|tax code|fiscal code|italian tax (code|number)|tax identification number|cf',
    ),
    attr: re('codice fiscale|codicefiscale|codfisc|cod fisc|cf|tax code|taxcode|fiscal code'),
  },
  {
    key: 'passportIssuingCountry',
    label: re(
      'issuing country|country of issue|issuing state|country of issuance|paese di rilascio|stato di rilascio|nazione di rilascio|pays de delivrance|pais de expedicion|ausstellungsland',
    ),
  },
  {
    key: 'passportIssuingAuthority',
    label: re(
      'issuing authority|issued by|authority|ente di rilascio|rilasciato da|autorita( di rilascio)?|autorite de delivrance|autoridad|ausstellende behorde',
    ),
  },
  {
    key: 'passportIssueDate',
    label: re(
      'date of issue|issue date|issued on|issuing date|date issued|data (di )?rilascio|data emissione|date de delivrance|fecha de (expedicion|emision)|ausstellungsdatum',
    ),
    attr: re('issue date|date of issue|issued|rilascio'),
  },
  {
    key: 'passportExpiryDate',
    label: re(
      'expiry( date)?|expiration( date)?|date of expiry|expires( on)?|valid until|valid thru|valid through|data (di )?scadenza|scadenza|date d expiration|valable jusqu au|fecha de (caducidad|vencimiento)|ablaufdatum|gultig bis',
    ),
    attr: re('expiry|expiration|expire|scadenza|valid until'),
  },
  {
    key: 'passportNumber',
    label: re(
      'passport (no|nr|number|num|n|id)|numero (di |del )?passaporto|n passaporto|numero de passeport|numero de pasaporte|reisepassnummer',
    ),
    attr: re('passport( no| number| num| n)?|passaporto|passport id'),
  },
  {
    key: 'nationalId',
    label: re(
      'national id( number)?|identity card( number)?|id card( number)?|carta d identita|numero (della )?carta d identita|carte d identite|dni|personalausweis',
    ),
  },
  {
    key: 'birthCountry',
    label: re(
      'country of birth|birth country|state of birth|stato (estero )?di nascita|nazione di nascita|paese di nascita|pays de naissance|pais de nacimiento|geburtsland',
    ),
    attr: re('birth country|country of birth|nazione nascita|stato nascita'),
  },
  {
    key: 'birthDate',
    label: re(
      'date of birth|birth ?date|dob|born on|data (di )?nascita|nato il|nata il|date de naissance|fecha de nacimiento|geburtsdatum',
    ),
    attr: re('dob|birth ?date|date of birth|birthday|data nascita|datanascita|bday'),
  },
  {
    key: 'birthCity',
    label: re(
      'place of birth|city of birth|birth ?place|birth city|town of birth|luogo di nascita|comune di nascita|citta di nascita|localita di nascita|lieu de naissance|ville de naissance|lugar de nacimiento|ciudad de nacimiento|geburtsort',
    ),
    attr: re('birth ?place|place of birth|birth city|luogo nascita|comune nascita'),
  },
  {
    key: 'secondCitizenship',
    label: re(
      '(second|other|additional|dual|double) (citizenship|nationality)|citizenship 2|nationality 2|seconda cittadinanza|altra cittadinanza|cittadinanza 2|seconda nazionalita',
    ),
  },
  {
    key: 'citizenship',
    label: re(
      'citizenship|nationality|cittadinanza|nazionalita|nationalite|nacionalidad|ciudadania|staatsangehorigkeit|nationalitat',
    ),
    attr: re('citizenship|nationality|cittadinanza|nazionalita'),
  },
  {
    key: 'maritalStatus',
    label: re(
      'marital status|civil status|stato civile|etat civil|situation familiale|estado civil|familienstand',
    ),
  },
  {
    key: 'nativeLanguage',
    label: re(
      'native language|mother tongue|first language|madrelingua|lingua madre|langue maternelle|lengua materna|muttersprache',
    ),
  },
  {
    key: 'sex',
    label: re('sex|gender|sesso|genere|sexe|genre|sexo|genero|geschlecht'),
    attr: re('sex|gender|sesso|genere'),
  },
  { key: 'age', label: re('age|eta|edad|alter') },
  {
    key: 'email',
    label: re(
      'e ?mail( address)?|email|posta elettronica|indirizzo e ?mail|courriel|adresse e ?mail|correo( electronico)?',
    ),
    attr: re('e ?mail'),
  },
  {
    key: 'phoneCountryCode',
    label: re(
      'country code|dial(l)?ing code|calling code|phone prefix|international prefix|prefisso( internazionale)?|pref internazionale|pref int|prefix|indicatif( pays)?|prefijo',
    ),
    attr: re('country code|dial code|phone prefix|prefisso|calling code'),
  },
  {
    key: 'phone',
    label: re(
      'phone( number)?|mobile( number| phone)?|telephone( number)?|cell( phone)?|cellphone|telefono|cellulare|recapito telefonico|numero di telefono|portable|telefone|movil|handy|telefonnummer|whatsapp',
    ),
    attr: re('phone|mobile|tel|telephone|telefono|cellulare|cell'),
  },
  {
    key: 'postalCode',
    label: re(
      'postal code|post code|postcode|zip( code)?|zip postal code|cap|codice postale|code postal|codigo postal|plz|postleitzahl',
    ),
    attr: re('zip|postal code|postcode|post code|cap|plz'),
  },
  {
    key: 'region',
    label: re(
      'state province|state region|province|region|county|state|provincia|regione|departement|estado|bundesland|prov',
    ),
    attr: re('province|region|state|provincia|county'),
  },
  {
    key: 'city',
    label: re(
      'city|town|municipality|comune|citta|localita|ville|ciudad|localidad|stadt|ort|city town',
    ),
    attr: re('city|town|comune|citta|municipality'),
  },
  {
    key: 'street',
    label: re(
      'street( address)?|address( line 1)?|address line|indirizzo|via e numero civico|via|residenza|adresse|direccion|calle|strasse|anschrift|home address',
    ),
    attr: re('street|address( line)?|addr|indirizzo|address1'),
  },
  {
    key: 'country',
    label: re('country( of residence)?|nation|nazione|paese|stato|pays|pais|land|country region'),
    attr: re('country|nazione|paese'),
  },
  {
    key: 'fullName',
    label: re(
      'full name|name and surname|first and last name|nome e cognome|cognome e nome|nom complet|nombre completo|vollstandiger name',
    ),
  },
  {
    key: 'familyName',
    label: re(
      'family name|last name|surname|cognome|nom de famille|nom|apellidos?|nachname|familienname',
    ),
    attr: re('last ?name|lastname|surname|family ?name|cognome|lname'),
  },
  {
    key: 'givenNames',
    label: re('first names?|given names?|forenames?|nome|prenoms?|nombres?|vorname|vornamen'),
    attr: re('first ?name|firstname|given ?name|forename|nome|fname'),
  },
];

const EDU_RULES: { key: IdKey; label: RegExp }[] = [
  {
    key: 'gradeScale',
    label: re(
      'grading scale|grade scale|scale|out of|maximum (grade|score)|max grade|scala|voto massimo|echelle|escala',
    ),
  },
  {
    key: 'grade',
    label: re(
      'gpa|grade point average|final grade|average grade|overall grade|cumulative|voto( finale| di laurea)?|media( ponderata)?|note finale|moyenne|nota media|promedio|grade',
    ),
  },
  {
    key: 'graduationDate',
    label: re(
      'graduation( date)?|date of (graduation|award|completion)|completion date|awarded on|data (di )?(laurea|conseguimento)|conseguito il|date d obtention|fecha de (graduacion|obtencion)|end date|to',
    ),
  },
  {
    key: 'fieldOfStudy',
    label: re(
      'field of study|major|subject|course of study|programme of study|discipline|corso di (laurea|studi)|classe di laurea|domaine|especialidad|studienfach',
    ),
  },
  {
    key: 'degree',
    label: re(
      'degree( title| name| obtained)?|qualification|title of (the )?degree|titolo( di studio| conseguito)?|diplome|titulo|abschluss',
    ),
  },
  {
    key: 'institution',
    label: re(
      'university|institution|school|college|name of (the )?(university|institution)|universita|ateneo|istituto|istituzione|etablissement|universite|universidad|hochschule',
    ),
  },
  {
    key: 'eduCountry',
    label: re('country( of (study|institution|the university))?|nazione|paese|stato|pays|pais'),
  },
];

function fromAutocomplete(ac: string): Classification | null {
  const token = ac.split(/\s+/).pop() ?? '';
  const exact = (key: IdKey, part?: DatePart): Classification => ({
    key,
    ...(part ? { part } : {}),
    confidence: 'exact',
  });
  switch (token) {
    case 'given-name':
      return exact('givenNames');
    case 'family-name':
      return exact('familyName');
    case 'name':
      return exact('fullName');
    case 'bday':
      return exact('birthDate');
    case 'bday-day':
      return exact('birthDate', 'day');
    case 'bday-month':
      return exact('birthDate', 'month');
    case 'bday-year':
      return exact('birthDate', 'year');
    case 'sex':
      return exact('sex');
    case 'email':
      return exact('email');
    case 'tel':
      return exact('phone');
    case 'tel-country-code':
      return exact('phoneCountryCode');
    case 'tel-national':
    case 'tel-local':
      return exact('phoneNational');
    case 'country':
    case 'country-name':
      return exact('country');
    case 'postal-code':
      return exact('postalCode');
    case 'street-address':
    case 'address-line1':
      return exact('street');
    case 'address-level2':
      return exact('city');
    case 'address-level1':
      return exact('region');
  }
  return null;
}

/** A dropdown whose options are the days 1 to 31, the 12 months, or a run of years. */
function partFromOptions(options: string[] = []): DatePart | undefined {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (opts.length < 10) return undefined;
  const nums = opts.filter((o) => /^\d{1,4}$/.test(o)).map(Number);
  // Allow a couple of heading options such as "Day" or "Giorno".
  const mostly = (n: number) => n >= opts.length - 2;
  if (mostly(nums.length)) {
    if (nums.every((n) => n >= 1900 && n <= 2100)) return 'year';
    if (Math.max(...nums) === 31 && nums.length >= 28) return 'day';
    if (Math.max(...nums) === 12 && nums.length === 12) return 'month';
  }
  const months = opts.map(monthIndex).filter((i) => i !== -1);
  if (months.length === 12 && new Set(months).size === 12) return 'month';
  return undefined;
}

function datePart(s: Signals, f: FieldInfo): DatePart | undefined {
  const text = `${s.label} ${s.attr}`;
  const fromOptions = partFromOptions(f.options);
  if (fromOptions) return fromOptions;
  // "Day" alone, not "Date of birth (dd/mm/yyyy)".
  const hasAll = DAY.test(text) && MONTH.test(text) && YEAR.test(text);
  if (hasAll) return undefined;
  if (DAY.test(text)) return 'day';
  if (MONTH.test(text)) return 'month';
  if (YEAR.test(text)) return 'year';
  return undefined;
}

/**
 * Which applicant fact this field asks for, or null. `prev` is the previous field's result, so
 * the month and year dropdowns after "Date of birth: [day]" inherit it.
 */
export function classifyField(f: FieldInfo, prev?: Classification | null): Classification | null {
  if (f.kind === 'textarea' || f.kind === 'contenteditable') return null;
  const s = signals(f);
  if (SKIP.some((r) => r.test(s.primary) || r.test(s.attr))) return null;
  if (f.kind === 'checkbox-group') {
    // Only the yes/no statements a form asks about the applicant's own data.
    const toggles: IdKey[] = ['domicileSame', 'noCodiceFiscale'];
    const rule = RULES.find((r) => toggles.includes(r.key) && r.label.test(s.label));
    return rule ? { key: rule.key, confidence: 'exact' } : null;
  }
  // The field's own label and section decide; a hint can be the next section's heading.
  const other = OTHER_PERSON.test(`${s.primary} ${s.section}`) || OTHER_PERSON.test(s.attr);
  const inEducation = EDUCATION.test(`${s.section} ${s.label}`) || EDUCATION.test(s.attr);
  const address: Classification['address'] = DOMICILE.test(`${s.section} ${s.label}`)
    ? 'domicile'
    : 'residence';

  if (other) {
    // Another person's name: only the parents' names are known; the rest isn't the applicant's.
    const name = /(^| )(name|nome|nom|nombre|vorname)( |$)/.test(s.label);
    if (name && FATHER.test(`${s.label} ${s.section}`))
      return { key: 'fatherName', confidence: 'likely' };
    if (name && MOTHER.test(`${s.label} ${s.section}`))
      return { key: 'motherName', confidence: 'likely' };
    return null;
  }

  const ac = fromAutocomplete(s.ac);
  if (ac)
    return ac.key === 'street' ||
      ac.key === 'city' ||
      ac.key === 'region' ||
      ac.key === 'postalCode' ||
      ac.key === 'country'
      ? { ...ac, address }
      : ac;

  const part = datePart(s, f);

  if (inEducation) {
    for (const rule of EDU_RULES) {
      if (rule.label.test(s.label)) {
        return rule.key === 'graduationDate' && part
          ? { key: rule.key, part, confidence: 'likely' }
          : { key: rule.key, confidence: 'likely' };
      }
    }
  }

  const match = (text: string, withAttr: boolean): Classification | null => {
    for (const rule of RULES) {
      const byLabel = !!text && rule.label.test(text);
      const byAttr = withAttr && (rule.attr?.test(s.attr) ?? false);
      if (!byLabel && !byAttr) continue;
      let key = rule.key;
      // Issue and expiry dates belong to a document.
      if (
        (key === 'passportIssueDate' || key === 'passportExpiryDate') &&
        !PASSPORT.test(`${text} ${s.attr} ${s.section}`) &&
        !/document|documento|(^| )id( |$)/.test(`${text} ${s.attr} ${s.section}`)
      )
        continue;
      if (DATE_KEYS.includes(key) && part)
        return { key, part, confidence: byLabel ? 'exact' : 'likely' };
      if (key === 'region' && /(^| )stato( |$)/.test(text) && !/stato civile/.test(text))
        key = 'country';
      const addr = ['street', 'city', 'region', 'postalCode', 'country'].includes(key)
        ? { address }
        : {};
      return { key, ...addr, confidence: byLabel ? 'exact' : 'likely' };
    }
    return null;
  };
  // The label (and name/id) first; placeholder and hint only when the label says nothing.
  const byPrimary = match(s.primary, true);
  if (byPrimary) return byPrimary;
  if (/^(passport|passaporto|passeport|pasaporte)( id)?$/.test(s.primary))
    return { key: 'passportNumber', confidence: 'likely' };
  const byExtra = match(s.extra, false);
  if (byExtra) return byExtra;

  // "Number" in an address section is the house number (Universitaly: Street, Number).
  if (
    ADDRESS.test(s.section) &&
    !PASSPORT.test(s.section) &&
    /^(number|no|nr|numero|n|num|n civico)$/.test(s.primary)
  )
    return { key: 'houseNumber', address, confidence: 'likely' };
  // "Number" in an identity document section: the form picks the type (we pick Passport).
  if (
    DOCUMENT.test(s.section) &&
    !ADDRESS.test(s.section) &&
    /^(number|no|nr|numero|n|num|document number|numero documento)$/.test(s.primary)
  )
    return { key: 'passportNumber', confidence: 'likely' };
  // "Name as in passport" beside a surname field: decided per form.
  if (
    /(^| )name (as|like) (in|on|shown in) (your )?passport|applicant name|candidate name/.test(
      s.primary,
    )
  )
    return { key: 'fullName', confidence: 'likely' };
  // "Number" / "No." inside a Passport section.
  if (PASSPORT.test(s.section) && /(^| )(number|no|nr|numero|n|num)( |$)/.test(s.label))
    return { key: 'passportNumber', confidence: 'likely' };
  // Bare "Name": decided per form.
  if (/(^| )(name|nome|nombre)( |$)/.test(s.label) && s.label.split(' ').length <= 3)
    return { key: 'fullName', confidence: 'likely' };
  // The second and third dropdowns of a split date carry no label of their own.
  if (part && prev && DATE_KEYS.includes(prev.key) && prev.part && prev.part !== part)
    return { key: prev.key, part, confidence: 'likely' };
  // A dropdown of countries under a heading that names what it is.
  return null;
}

// ---------------------------------------------------------------------------------------------
// Formatting

const MONTH_NAMES: string[][] = (() => {
  const out: string[][] = [];
  for (const lang of ['en', 'it', 'fr', 'es', 'de', 'pt', 'nl']) {
    for (const style of ['long', 'short'] as const) {
      try {
        const fmt = new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' });
        out.push(
          Array.from({ length: 12 }, (_, m) =>
            normalizeText(fmt.format(new Date(Date.UTC(2020, m, 15)))),
          ),
        );
      } catch {
        // Locale data missing: skip.
      }
    }
  }
  return out;
})();

/** 0 to 11 for a month name or abbreviation in a common language, else -1. */
export function monthIndex(text: string): number {
  const t = normalizeText(text).replace(/\.$/, '');
  if (!t) return -1;
  for (const names of MONTH_NAMES) {
    const i = names.findIndex(
      (n) => n === t || (t.length >= 3 && n.startsWith(t)) || (n.length >= 3 && t.startsWith(n)),
    );
    if (i !== -1) return i;
  }
  return -1;
}

export type DateOrder = 'DMY' | 'MDY' | 'YMD';
export interface DateFormat {
  order: DateOrder;
  sep: string;
  /** Two-digit year. */
  yy: boolean;
  /** Read from the field itself; false when inferred from the page language. */
  sure: boolean;
  /** type="date" wants YYYY-MM-DD whatever the display. */
  native?: 'date' | 'month';
}

/** Read the expected date format from the field: type, placeholder, hint, label, or pattern. */
export function dateFormat(f: FieldInfo, page?: Pick<PageInfo, 'lang' | 'hostname'>): DateFormat {
  if (f.inputType === 'date')
    return { order: 'YMD', sep: '-', yy: false, sure: true, native: 'date' };
  if (f.inputType === 'month')
    return { order: 'YMD', sep: '-', yy: false, sure: true, native: 'month' };
  const text = [f.placeholder, f.hint, f.label].filter(Boolean).join(' ').toLowerCase();
  const m = text.match(
    /\b(dd|gg|jj|tt|mm|yyyy|aaaa|jjjj)([./\s-])(dd|gg|jj|tt|mm)\2(yyyy|aaaa|jjjj|yy|aa)\b|\b(yyyy|aaaa)([./-])(mm)\6(dd|gg)\b/,
  );
  if (m) {
    if (m[5]) return { order: 'YMD', sep: m[6]!, yy: false, sure: true };
    const first = m[1]!;
    const order: DateOrder = first === 'mm' ? 'MDY' : 'DMY';
    return { order, sep: m[2]!, yy: /^(yy|aa)$/.test(m[4]!), sure: true };
  }
  // A concrete example: "e.g. 31/12/2000" or "2000-12-31".
  const ex = text.match(/\b(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})\b/);
  if (ex) {
    if (ex[1]!.length === 4) return { order: 'YMD', sep: ex[2]!, yy: false, sure: true };
    const a = Number(ex[1]);
    const b = Number(ex[3]);
    if (a > 12) return { order: 'DMY', sep: ex[2]!, yy: ex[4]!.length === 2, sure: true };
    if (b > 12) return { order: 'MDY', sep: ex[2]!, yy: ex[4]!.length === 2, sure: true };
  }
  // No clue on the field: most of the world writes day first; US English sites write month first.
  const us = /^en-us/i.test(page?.lang ?? '') || /\.(us|gov)$/.test(page?.hostname ?? '');
  return { order: us ? 'MDY' : 'DMY', sep: '/', yy: false, sure: false };
}

export function formatDate(iso: string, fmt: DateFormat): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  if (fmt.native === 'date') return iso;
  if (fmt.native === 'month') return `${y}-${m}`;
  const year = fmt.yy ? y.slice(2) : y;
  const parts =
    fmt.order === 'DMY' ? [d, m, year] : fmt.order === 'MDY' ? [m, d, year] : [year, m, d];
  return parts.join(fmt.sep);
}

/** Pick the dropdown option for a date part: "07", "7", "July", "Luglio", "Jul". */
function datePartOption(options: string[], iso: string, part: DatePart): number {
  const [y, m, d] = iso.split('-').map(Number);
  const want = part === 'day' ? d! : part === 'month' ? m! : y!;
  const byNumber = options.findIndex((o) => /^\d+$/.test(o.trim()) && Number(o) === want);
  if (byNumber !== -1) return byNumber;
  if (part === 'month') return options.findIndex((o) => monthIndex(o) === want - 1);
  return -1;
}

const SEX_WORDS: Record<'F' | 'M' | 'X', RegExp> = {
  F: re(
    'f|female|woman|women|donna|femmina|femminile|femme|feminin|mujer|femenino|weiblich|w|feminine',
  ),
  M: re('m|male|man|men|uomo|maschio|maschile|homme|masculin|hombre|masculino|mannlich|masculine'),
  X: re('x|other|non binary|nonbinary|diverse|divers|altro|autre|otro|another gender'),
};
const MARITAL_WORDS: Record<string, RegExp> = {
  single: re(
    'single|unmarried|never married|celibe|nubile|celibe nubile|celibataire|soltero|soltera|ledig',
  ),
  married: re('married|coniugato|coniugata|sposato|sposata|marie|mariee|casado|casada|verheiratet'),
  divorced: re('divorced|divorziato|divorziata|divorce|divorcee|divorciado|divorciada|geschieden'),
  widowed: re('widowed|widow|widower|vedovo|vedova|veuf|veuve|viudo|viuda|verwitwet'),
};

function optionMatching(options: string[], word: RegExp): number {
  return options.findIndex((o) => word.test(normalizeText(o)));
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** "As in passport", "without accents", or an Italian ministry portal: plain Latin letters. */
function latinWanted(f: FieldInfo, page?: Pick<PageInfo, 'lang' | 'hostname'>): boolean {
  const t = normalizeText([f.label, f.hint, f.placeholder].filter(Boolean).join(' '));
  return (
    /passport|passaporto|machine readable|mrz|without accents|no accents|senza accenti|latin (letters|characters)|caratteri latini|special characters|caratteri speciali/.test(
      t,
    ) || /universitaly|esteri\.it|studyinitaly/.test(page?.hostname ?? '')
  );
}

function upperWanted(f: FieldInfo): boolean {
  const t = normalizeText([f.label, f.hint, f.placeholder].filter(Boolean).join(' '));
  return (
    /capital letters|block letters|uppercase|upper case|maiuscol|stampatello|majuscules|mayusculas/.test(
      t,
    ) ||
    (!!f.placeholder &&
      f.placeholder.length > 3 &&
      f.placeholder === f.placeholder.toUpperCase() &&
      /[A-Z]/.test(f.placeholder))
  );
}

function address(a: Applicant, which: 'residence' | 'domicile' | undefined): Address {
  const dom = a.domicile;
  const hasDomicile = !!(dom.street || dom.city || dom.country);
  return which === 'domicile' && hasDomicile ? dom : a.residence;
}

/** "Bole Road 12" / "12 Bole Road" / "Via Roma, 5" -> name and number. */
export function splitStreet(street: string): { name: string; number: string } {
  const t = street.trim();
  const tail = t.match(/^(.*?)[,\s]+(\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?)?)$/);
  if (tail) return { name: tail[1]!.trim(), number: tail[2]! };
  const head = t.match(/^(\d+[a-zA-Z]?)[,\s]+(.+)$/);
  if (head) return { name: head[2]!.trim(), number: head[1]! };
  return { name: t, number: '' };
}

const YES = re('yes|si|oui|ja|true|y|s');
const NO = re('no|non|nein|false|n');

export interface FillValue {
  /** Text for text fields; for choice fields, the exact option label. */
  value: string;
  /** Why it may need a look: format guessed, too long, no matching option, missing data. */
  issues: string[];
  /** The applicant has no value for this. */
  missing?: boolean;
  /** Leave the field as it is (e.g. "I have no codice fiscale" when there is one). */
  skip?: boolean;
  formatGuessed?: boolean;
}

const ISSUE = {
  missing: 'missing',
  noOption: 'no-option',
  tooLong: 'too-long',
  pattern: 'pattern',
  guessedFormat: 'guessed-format',
} as const;
export type IssueCode = (typeof ISSUE)[keyof typeof ISSUE];

/** The raw fact for a key, before formatting (ISO dates and countries, plain text). */
export function rawValue(key: IdKey, a: Applicant, c: Classification, today = new Date()): string {
  const edu = latestEducation(a);
  const addr = address(a, c.address);
  switch (key) {
    case 'givenNames':
      return a.givenNames;
    case 'familyName':
      return a.familyName;
    case 'fullName':
      return [a.givenNames, a.familyName].filter(Boolean).join(' ');
    case 'sex':
      return a.sex;
    case 'birthDate':
      return a.birthDate;
    case 'birthCity':
      return a.birthCity;
    case 'birthCountry':
      return a.birthCountry;
    case 'citizenship':
      return a.citizenship;
    case 'secondCitizenship':
      return a.secondCitizenship;
    case 'maritalStatus':
      return a.maritalStatus;
    case 'fatherName':
      return a.fatherName;
    case 'motherName':
      return a.motherName;
    case 'nativeLanguage':
      return a.nativeLanguage;
    case 'passportNumber':
      return a.passport.number.replace(/\s+/g, '').toUpperCase();
    case 'passportIssueDate':
      return a.passport.issueDate;
    case 'passportExpiryDate':
      return a.passport.expiryDate;
    case 'passportIssuingCountry':
      return a.passport.issuingCountry;
    case 'passportIssuingAuthority':
      return a.passport.issuingAuthority;
    case 'nationalId':
      return a.nationalId;
    case 'codiceFiscale':
      return a.codiceFiscale.replace(/\s+/g, '').toUpperCase();
    case 'email':
      return a.email;
    case 'phone':
    case 'phoneNational':
      return a.phoneNumber.replace(/[^\d]/g, '');
    case 'phoneCountryCode':
      return a.phoneCountry;
    case 'street':
      return addr.street;
    case 'city':
      return addr.city;
    case 'region':
      return addr.region;
    case 'postalCode':
      return addr.postalCode;
    case 'country':
      return addr.country;
    case 'institution':
      return edu?.institution ?? '';
    case 'degree':
      return edu?.degree ?? '';
    case 'fieldOfStudy':
      return edu?.field ?? '';
    case 'graduationDate':
      return edu?.graduationDate ?? '';
    case 'grade':
      return edu?.grade ?? '';
    case 'gradeScale':
      return edu?.gradeScale ?? '';
    case 'eduCountry':
      return edu?.country ?? '';
    case 'houseNumber':
      return splitStreet(addr.street).number;
    case 'documentType':
      return a.passport.number ? 'passport' : '';
    case 'domicileSame': {
      const d = a.domicile;
      return d.street || d.city || d.country ? 'no' : 'yes';
    }
    case 'noCodiceFiscale':
      return a.codiceFiscale.trim() ? 'has' : 'none';
    case 'age': {
      const age = ageOn(a.birthDate, today.toISOString().slice(0, 10));
      return age === null ? '' : String(age);
    }
  }
}

const CHOICE = ['select', 'radio-group'];

/** Format the applicant's value for this exact field. */
export function formatFor(
  f: FieldInfo,
  c: Classification,
  a: Applicant,
  page?: Pick<PageInfo, 'lang' | 'hostname'>,
  opts: { splitPhone?: boolean; splitHouseNumber?: boolean; today?: Date } = {},
): FillValue {
  const raw = rawValue(c.key, a, c, opts.today);
  if (!raw) return { value: '', issues: [ISSUE.missing], missing: true };
  const issues: string[] = [];
  const choice = CHOICE.includes(f.kind) && !!f.options?.length;
  const options = f.options ?? [];
  const lang = page?.lang ?? null;
  let value = raw;
  let formatGuessed = false;

  const pick = (i: number): FillValue =>
    i === -1 ? { value: '', issues: [ISSUE.noOption] } : { value: options[i]!, issues: [] };

  if (DATE_KEYS.includes(c.key)) {
    if (c.part) {
      if (choice) return pick(datePartOption(options, raw, c.part));
      const [y, m, d] = raw.split('-');
      value = c.part === 'day' ? d! : c.part === 'month' ? m! : y!;
      if (c.part === 'year' && f.maxLength === 2) value = y!.slice(2);
    } else {
      const fmt = dateFormat(f, page);
      value = formatDate(raw, fmt);
      formatGuessed = !fmt.sure;
      if (formatGuessed) issues.push(ISSUE.guessedFormat);
    }
  } else if (COUNTRY_KEYS.includes(c.key)) {
    if (choice) return pick(matchCountryOption(raw, options, f.optionValues, lang));
    const label = normalizeText(f.label ?? '');
    const c3 = countryByIso2(raw);
    if (f.maxLength === 2) value = raw;
    else if (f.maxLength === 3) value = c3?.iso3 ?? raw;
    else if (
      c.key === 'citizenship' &&
      /nationality/.test(label) &&
      (lang ?? 'en').startsWith('en') &&
      c3?.demonym
    )
      value = c3.demonym;
    else value = countryName(raw, (lang ?? 'en').slice(0, 2));
  } else if (c.key === 'sex') {
    const s = raw as 'F' | 'M' | 'X';
    if (choice) {
      // One-letter options ("M"/"F") match exactly; words match by language.
      const exact = options.findIndex((o) => o.trim().toUpperCase() === s);
      return pick(exact !== -1 ? exact : optionMatching(options, SEX_WORDS[s]));
    }
    value =
      f.maxLength === 1 || /\bm\s*\/\s*f\b|\bf\s*\/\s*m\b/i.test(f.placeholder ?? '')
        ? s
        : { F: 'Female', M: 'Male', X: 'Other' }[s];
  } else if (c.key === 'maritalStatus') {
    if (choice) return pick(optionMatching(options, MARITAL_WORDS[raw]!));
    value = raw[0]!.toUpperCase() + raw.slice(1);
  } else if (c.key === 'documentType') {
    const passport = re('passport|passaporto|passeport|pasaporte|reisepass');
    if (choice) return pick(optionMatching(options, passport));
    value = 'Passport';
  } else if (c.key === 'domicileSame' || c.key === 'noCodiceFiscale') {
    const yes = c.key === 'domicileSame' ? raw === 'yes' : raw === 'none';
    if (f.kind === 'checkbox-group') {
      // A single statement to tick, or leave unticked.
      return yes && options.length
        ? { value: options[0]!, issues: [] }
        : { value: '', issues: [], skip: true };
    }
    if (choice) return pick(optionMatching(options, yes ? YES : NO));
    return { value: '', issues: [], skip: true };
  } else if (c.key === 'phoneCountryCode') {
    const dial = countryByIso2(raw)?.dial ?? '';
    if (choice) {
      const byDial = options.findIndex(
        (o) => new RegExp(`\\+\\s?${dial}(\\D|$)`).test(o) || o.trim() === dial,
      );
      return pick(byDial !== -1 ? byDial : matchCountryOption(raw, options, f.optionValues, lang));
    }
    value = `+${dial}`;
  } else if (c.key === 'phone' || c.key === 'phoneNational') {
    const dial = countryByIso2(a.phoneCountry)?.dial;
    let national = raw.replace(/^0+/, '');
    // Stored with the country code already in it ("+251 911..."): don't double it.
    if (dial && national.startsWith(dial) && national.length - dial.length >= 7)
      national = national.slice(dial.length);
    if (c.key === 'phoneNational' || opts.splitPhone) value = national;
    else if (dial) {
      // "+251 911234567": portals accept the space more often than not (Sapienza requires it);
      // drop it only when the field is too short.
      value = `+${dial} ${national}`;
      if (f.maxLength && value.length > f.maxLength) value = `+${dial}${national}`;
    } else value = raw;
  } else if (choice) {
    // Free-text facts in a dropdown (degree level, institution): exact or whole-word match only.
    const want = normalizeText(raw);
    const i = options.findIndex((o) => normalizeText(o) === want);
    return pick(
      i !== -1 ? i : options.findIndex((o) => normalizeText(o).includes(want) && want.length >= 4),
    );
  }

  if (c.key === 'street' && opts.splitHouseNumber) value = splitStreet(value).name;
  const NAMES: IdKey[] = ['givenNames', 'familyName', 'fullName', 'fatherName', 'motherName'];
  // Passport names are Latin letters without accents (Universitaly and IYT copy them from the MRZ).
  if (NAMES.includes(c.key) && latinWanted(f, page)) value = stripAccents(value);
  if ([...NAMES, 'birthCity', 'city'].includes(c.key) && upperWanted(f))
    value = value.toUpperCase();
  if (
    c.key === 'fullName' &&
    /cognome e nome|surname and name|last name first|nom et prenom/.test(
      normalizeText(f.label ?? ''),
    )
  )
    value = [a.familyName, a.givenNames].filter(Boolean).join(' ');

  if (f.maxLength && value.length > f.maxLength) issues.push(ISSUE.tooLong);
  if (f.pattern) {
    try {
      if (!new RegExp(`^(?:${f.pattern})$`, 'v').test(value)) issues.push(ISSUE.pattern);
    } catch {
      // A pattern the browser would also ignore.
    }
  }
  return { value, issues, ...(formatGuessed ? { formatGuessed } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Whole form

export interface PlanItem {
  field: FieldInfo;
  classification: Classification | null;
  fill: FillValue | null;
  /** Personal-looking field we couldn't map: never sent to the AI. */
  personal: boolean;
  /** An open question the AI may draft from the candidate's profile. */
  essay: boolean;
}

const PERSONAL = re(
  'name|names|surname|nome|cognome|nom|prenom|nombre|apellido|vorname|nachname|passport|passaporto|birth|nascita|naissance|nacimiento|codice fiscale|tax|fiscal|social security|ssn|national id|identity|identita|visa|permesso|residence permit|iban|bank|account number|phone|telefono|address|indirizzo|zip|postal|citizenship|nationality|cittadinanza|nazionalita|sex|gender|sesso|marital|stato civile|father|mother|padre|madre|parent|emergency|signature|firma',
);

/** A field that asks for a personal fact: fill it from details or leave it to the user. */
const ESSAY = re(
  'why|describe|explain|tell us|motivation|motivational|statement|essay|purpose|goals?|interests?|experience|plans?|reasons?|contribute|achievements?|challenges?|perche|descrivi|descrivere|spiega|motivazione|obiettivi|esperienza|pourquoi|decrivez|motivation|por que|describe|warum|beschreiben',
);

/** Open questions only: short fields the applicant must answer themselves stay with them. */
export function isEssay(f: FieldInfo): boolean {
  if (f.kind === 'textarea' || f.kind === 'contenteditable') return true;
  if (f.kind !== 'input' || (f.inputType && !['text', ''].includes(f.inputType))) return false;
  const text = [f.label, f.placeholder, f.hint].filter(Boolean).join(' ');
  return text.includes('?') || ESSAY.test(normalizeText(text));
}

/** One of the look-alike fields that must stay empty (previous name, PEC, birth province). */
export function isSkipped(f: FieldInfo): boolean {
  const s = signals(f);
  return SKIP.some((r) => r.test(s.primary) || r.test(s.attr));
}

export function looksPersonal(f: FieldInfo): boolean {
  const s = signals(f);
  if (isSkipped(f)) return true;
  // Another person's details (emergency contact, referee): never the AI's to invent.
  if (OTHER_PERSON.test(`${s.primary} ${s.section}`)) return true;
  return PERSONAL.test(`${s.label} ${s.attr}`) || NAME_WORD.test(s.primary);
}

/** Classify and format every field of a form, with form-level fixes. */
export function planForm(
  fields: FieldInfo[],
  a: Applicant,
  page?: Pick<PageInfo, 'lang' | 'hostname'>,
  today = new Date(),
): PlanItem[] {
  let prev: Classification | null = null;
  const classes = fields.map((f) => {
    const c = classifyField(f, prev);
    prev = c;
    return c;
  });
  // A bare "Name" next to a "Surname" field means the given names.
  const hasFamily = classes.some((c) => c?.key === 'familyName');
  const hasGiven = classes.some((c) => c?.key === 'givenNames');
  classes.forEach((c, i) => {
    if (c?.key === 'fullName' && c.confidence === 'likely' && hasFamily && !hasGiven)
      classes[i] = { key: 'givenNames', confidence: 'likely' };
  });
  // Esse3's "Dati personali": Nazione and Comune/Citta right after the birth date mean the
  // country and city of birth, not of residence.
  const BIRTH: IdKey[] = ['birthDate', 'birthCity', 'birthCountry'];
  const blanked = new Set<number>();
  classes.forEach((c, i) => {
    if (!c || !['country', 'city', 'region', 'postalCode'].includes(c.key)) return;
    const f = fields[i]!;
    const own = normalizeText(`${f.label ?? ''} ${f.section ?? ''}`);
    if (ADDRESS.test(own) || /resid|domicil/.test(own)) return;
    const sameSection =
      !!f.section &&
      fields.some((g, j) => g.section === f.section && BIRTH.includes(classes[j]?.key as IdKey));
    const near = [i - 3, i - 2, i - 1, i + 1, i + 2, i + 3].some((j) =>
      BIRTH.includes(classes[j]?.key as IdKey),
    );
    if (!sameSection && !near) return;
    if (c.key === 'country') classes[i] = { key: 'birthCountry', confidence: 'likely' };
    else if (c.key === 'city') classes[i] = { key: 'birthCity', confidence: 'likely' };
    // A birth province or postcode only exists for births in Italy: leave it, and keep it away
    // from the AI.
    else {
      classes[i] = null;
      blanked.add(i);
    }
  });
  // A separate country-code field means the phone field wants the national number.
  const splitPhone = classes.some((c) => c?.key === 'phoneCountryCode');
  const splitHouseNumber = classes.some((c) => c?.key === 'houseNumber');
  return fields.map((field, i) => {
    const classification = classes[i] ?? null;
    const fill = classification
      ? formatFor(field, classification, a, page, { splitPhone, splitHouseNumber, today })
      : null;
    return {
      field,
      classification,
      fill,
      personal: !classification && (blanked.has(i) || looksPersonal(field)),
      essay: !classification && !looksPersonal(field) && !blanked.has(i) && isEssay(field),
    };
  });
}
