// Countries for exact form filling: ISO 3166-1 alpha-2 and alpha-3, international calling code,
// and the English demonym (for "Nationality: Ethiopian" style fields). Country names in any
// language come from the browser's Intl.DisplayNames, so they match what forms print.
// Kosovo uses the widely used user-assigned code XK / XKX.

const TABLE = `AF AFG 93 Afghan|AX ALA 358 Ålandish|AL ALB 355 Albanian|DZ DZA 213 Algerian|AS ASM 1 American Samoan|AD AND 376 Andorran|AO AGO 244 Angolan|AI AIA 1 Anguillian|AQ ATA 672 -|AG ATG 1 Antiguan|AR ARG 54 Argentine|AM ARM 374 Armenian|AW ABW 297 Aruban|AU AUS 61 Australian|AT AUT 43 Austrian|AZ AZE 994 Azerbaijani|BS BHS 1 Bahamian|BH BHR 973 Bahraini|BD BGD 880 Bangladeshi|BB BRB 1 Barbadian|BY BLR 375 Belarusian|BE BEL 32 Belgian|BZ BLZ 501 Belizean|BJ BEN 229 Beninese|BM BMU 1 Bermudian|BT BTN 975 Bhutanese|BO BOL 591 Bolivian|BQ BES 599 -|BA BIH 387 Bosnian|BW BWA 267 Motswana|BV BVT 47 -|BR BRA 55 Brazilian|IO IOT 246 -|BN BRN 673 Bruneian|BG BGR 359 Bulgarian|BF BFA 226 Burkinabe|BI BDI 257 Burundian|CV CPV 238 Cape Verdean|KH KHM 855 Cambodian|CM CMR 237 Cameroonian|CA CAN 1 Canadian|KY CYM 1 Caymanian|CF CAF 236 Central African|TD TCD 235 Chadian|CL CHL 56 Chilean|CN CHN 86 Chinese|CX CXR 61 -|CC CCK 61 -|CO COL 57 Colombian|KM COM 269 Comoran|CG COG 242 Congolese|CD COD 243 Congolese|CK COK 682 Cook Islander|CR CRI 506 Costa Rican|CI CIV 225 Ivorian|HR HRV 385 Croatian|CU CUB 53 Cuban|CW CUW 599 Curaçaoan|CY CYP 357 Cypriot|CZ CZE 420 Czech|DK DNK 45 Danish|DJ DJI 253 Djiboutian|DM DMA 1 Dominican|DO DOM 1 Dominican|EC ECU 593 Ecuadorian|EG EGY 20 Egyptian|SV SLV 503 Salvadoran|GQ GNQ 240 Equatorial Guinean|ER ERI 291 Eritrean|EE EST 372 Estonian|SZ SWZ 268 Swazi|ET ETH 251 Ethiopian|FK FLK 500 Falkland Islander|FO FRO 298 Faroese|FJ FJI 679 Fijian|FI FIN 358 Finnish|FR FRA 33 French|GF GUF 594 French Guianese|PF PYF 689 French Polynesian|TF ATF 262 -|GA GAB 241 Gabonese|GM GMB 220 Gambian|GE GEO 995 Georgian|DE DEU 49 German|GH GHA 233 Ghanaian|GI GIB 350 Gibraltarian|GR GRC 30 Greek|GL GRL 299 Greenlandic|GD GRD 1 Grenadian|GP GLP 590 Guadeloupean|GU GUM 1 Guamanian|GT GTM 502 Guatemalan|GG GGY 44 -|GN GIN 224 Guinean|GW GNB 245 Bissau-Guinean|GY GUY 592 Guyanese|HT HTI 509 Haitian|HM HMD 672 -|VA VAT 39 -|HN HND 504 Honduran|HK HKG 852 Hongkonger|HU HUN 36 Hungarian|IS ISL 354 Icelandic|IN IND 91 Indian|ID IDN 62 Indonesian|IR IRN 98 Iranian|IQ IRQ 964 Iraqi|IE IRL 353 Irish|IM IMN 44 Manx|IL ISR 972 Israeli|IT ITA 39 Italian|JM JAM 1 Jamaican|JP JPN 81 Japanese|JE JEY 44 -|JO JOR 962 Jordanian|KZ KAZ 7 Kazakh|KE KEN 254 Kenyan|KI KIR 686 I-Kiribati|KP PRK 850 North Korean|KR KOR 82 South Korean|KW KWT 965 Kuwaiti|KG KGZ 996 Kyrgyz|LA LAO 856 Lao|LV LVA 371 Latvian|LB LBN 961 Lebanese|LS LSO 266 Mosotho|LR LBR 231 Liberian|LY LBY 218 Libyan|LI LIE 423 Liechtensteiner|LT LTU 370 Lithuanian|LU LUX 352 Luxembourgish|MO MAC 853 Macanese|MG MDG 261 Malagasy|MW MWI 265 Malawian|MY MYS 60 Malaysian|MV MDV 960 Maldivian|ML MLI 223 Malian|MT MLT 356 Maltese|MH MHL 692 Marshallese|MQ MTQ 596 Martinican|MR MRT 222 Mauritanian|MU MUS 230 Mauritian|YT MYT 262 Mahoran|MX MEX 52 Mexican|FM FSM 691 Micronesian|MD MDA 373 Moldovan|MC MCO 377 Monegasque|MN MNG 976 Mongolian|ME MNE 382 Montenegrin|MS MSR 1 Montserratian|MA MAR 212 Moroccan|MZ MOZ 258 Mozambican|MM MMR 95 Burmese|NA NAM 264 Namibian|NR NRU 674 Nauruan|NP NPL 977 Nepali|NL NLD 31 Dutch|NC NCL 687 New Caledonian|NZ NZL 64 New Zealander|NI NIC 505 Nicaraguan|NE NER 227 Nigerien|NG NGA 234 Nigerian|NU NIU 683 Niuean|NF NFK 672 -|MK MKD 389 Macedonian|MP MNP 1 -|NO NOR 47 Norwegian|OM OMN 968 Omani|PK PAK 92 Pakistani|PW PLW 680 Palauan|PS PSE 970 Palestinian|PA PAN 507 Panamanian|PG PNG 675 Papua New Guinean|PY PRY 595 Paraguayan|PE PER 51 Peruvian|PH PHL 63 Filipino|PN PCN 64 -|PL POL 48 Polish|PT PRT 351 Portuguese|PR PRI 1 Puerto Rican|QA QAT 974 Qatari|RE REU 262 Reunionese|RO ROU 40 Romanian|RU RUS 7 Russian|RW RWA 250 Rwandan|BL BLM 590 -|SH SHN 290 Saint Helenian|KN KNA 1 Kittitian|LC LCA 1 Saint Lucian|MF MAF 590 -|PM SPM 508 -|VC VCT 1 Vincentian|WS WSM 685 Samoan|SM SMR 378 Sammarinese|ST STP 239 Santomean|SA SAU 966 Saudi|SN SEN 221 Senegalese|RS SRB 381 Serbian|SC SYC 248 Seychellois|SL SLE 232 Sierra Leonean|SG SGP 65 Singaporean|SX SXM 1 -|SK SVK 421 Slovak|SI SVN 386 Slovenian|SB SLB 677 Solomon Islander|SO SOM 252 Somali|ZA ZAF 27 South African|GS SGS 500 -|SS SSD 211 South Sudanese|ES ESP 34 Spanish|LK LKA 94 Sri Lankan|SD SDN 249 Sudanese|SR SUR 597 Surinamese|SJ SJM 47 -|SE SWE 46 Swedish|CH CHE 41 Swiss|SY SYR 963 Syrian|TW TWN 886 Taiwanese|TJ TJK 992 Tajik|TZ TZA 255 Tanzanian|TH THA 66 Thai|TL TLS 670 Timorese|TG TGO 228 Togolese|TK TKL 690 Tokelauan|TO TON 676 Tongan|TT TTO 1 Trinidadian|TN TUN 216 Tunisian|TR TUR 90 Turkish|TM TKM 993 Turkmen|TC TCA 1 -|TV TUV 688 Tuvaluan|UG UGA 256 Ugandan|UA UKR 380 Ukrainian|AE ARE 971 Emirati|GB GBR 44 British|US USA 1 American|UM UMI 1 -|UY URY 598 Uruguayan|UZ UZB 998 Uzbek|VU VUT 678 Ni-Vanuatu|VE VEN 58 Venezuelan|VN VNM 84 Vietnamese|VG VGB 1 -|VI VIR 1 -|WF WLF 681 -|EH ESH 212 Sahrawi|YE YEM 967 Yemeni|ZM ZMB 260 Zambian|ZW ZWE 263 Zimbabwean|XK XKX 383 Kosovar`;

export interface Country {
  iso2: string;
  iso3: string;
  /** Calling code without the plus. */
  dial: string;
  /** English demonym, or '' when there isn't a usable one. */
  demonym: string;
}

export const COUNTRIES: Country[] = TABLE.split('|').map((row) => {
  const [iso2, iso3, dial, ...rest] = row.split(' ');
  const demonym = rest.join(' ');
  return { iso2: iso2!, iso3: iso3!, dial: dial!, demonym: demonym === '-' ? '' : demonym };
});

const BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));
const BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
/** Passport MRZ codes that aren't ISO alpha-3. */
const MRZ_EXTRA: Record<string, string> = {
  D: 'DE',
  GBD: 'GB',
  GBN: 'GB',
  GBO: 'GB',
  GBS: 'GB',
  GBP: 'GB',
  UNK: 'XK',
  RKS: 'XK',
};

export function countryByIso2(code: string): Country | undefined {
  return BY_ISO2.get(code.toUpperCase());
}

/** ISO alpha-3 or a passport MRZ code to alpha-2. */
export function iso2FromIso3(code: string): string | undefined {
  const c = code.replace(/</g, '').toUpperCase();
  return BY_ISO3.get(c)?.iso2 ?? MRZ_EXTRA[c];
}

const LANGS = ['en', 'it', 'fr', 'es', 'de', 'pt', 'nl'];
const displayNames = new Map<string, Intl.DisplayNames>();

/** The country's name in a language, e.g. ('ET', 'it') -> 'Etiopia'. */
export function countryName(iso2: string, lang = 'en'): string {
  try {
    let dn = displayNames.get(lang);
    if (!dn) {
      dn = new Intl.DisplayNames([lang], { type: 'region' });
      displayNames.set(lang, dn);
    }
    return dn.of(iso2.toUpperCase()) ?? iso2;
  } catch {
    return iso2;
  }
}

/** Lower-case, no accents, no punctuation: 'Côte d’Ivoire' -> 'cote d ivoire'. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

/** Every way a form may write this country: names in common languages, codes, demonym. */
export function countryAliases(iso2: string, pageLang?: string | null): string[] {
  const c = countryByIso2(iso2);
  if (!c) return [];
  const langs = pageLang ? [pageLang.slice(0, 2).toLowerCase(), ...LANGS] : LANGS;
  const names = [...new Set(langs.map((l) => countryName(c.iso2, l)))];
  return [...names, c.demonym].filter(Boolean);
}

/**
 * The option that means this country, from a dropdown's labels and values. Exact matches on
 * names, codes (IT, ITA), or the demonym win; then an option that starts with or contains the
 * name ("Ethiopia (+251)"). Returns the option index, or -1.
 */
export function matchCountryOption(
  iso2: string,
  labels: string[],
  values: string[] = [],
  pageLang?: string | null,
): number {
  const c = countryByIso2(iso2);
  if (!c) return -1;
  const codes = new Set([c.iso2.toLowerCase(), c.iso3.toLowerCase()]);
  const aliases = countryAliases(iso2, pageLang).map(normalizeText).filter(Boolean);
  const norm = labels.map(normalizeText);

  const exact = norm.findIndex((l) => aliases.includes(l) || codes.has(l));
  if (exact !== -1) return exact;
  const byValue = values.findIndex((v) => codes.has(v.trim().toLowerCase()));
  if (byValue !== -1) return byValue;
  // "Ethiopia (ET)", "ET - Ethiopia", "+251 Ethiopia": the name as a whole word inside the label.
  const long = aliases.filter((a) => a.length >= 4);
  const partial = norm.findIndex((l) =>
    long.some((a) => new RegExp(`(^| )${a.replace(/\+/g, '\\+')}( |$)`).test(l)),
  );
  return partial;
}

/** A country from free text: a name in a common language, a code, or a demonym. */
export function findCountry(text: string): string | undefined {
  const t = normalizeText(text);
  if (!t) return undefined;
  for (const c of COUNTRIES) {
    if (t === c.iso2.toLowerCase() || t === c.iso3.toLowerCase()) return c.iso2;
    if (c.demonym && t === normalizeText(c.demonym)) return c.iso2;
    if (LANGS.some((l) => normalizeText(countryName(c.iso2, l)) === t)) return c.iso2;
  }
  return undefined;
}
