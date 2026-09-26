import { t } from '@/ui/i18n';

// What Italian university and scholarship portals expect, from their own guides (researched
// September 2026). Dated facts come from the 2026/27 calls: the UI says to check the current one.

export interface GuideItem {
  title: string;
  points: string[];
  source: string;
}

export function italyGuide(): GuideItem[] {
  return [
    {
      title: t('guide_universitaly_title', 'Universitaly pre-enrolment (non-EU students)'),
      points: [
        t(
          'guide_universitaly_1',
          'Names exactly as in the passport, in Latin letters without accents; write XXX if you have no surname. They cannot be changed after saving.',
        ),
        t(
          'guide_universitaly_2',
          'Birth date is three dropdowns (day, month, year). Phone with the country code.',
        ),
        t(
          'guide_universitaly_3',
          'Upload a face photo and your passport: PDF, JPEG, or PNG, 10 MB at most. One application per academic year.',
        ),
      ],
      source: 'https://www.universitaly.it',
    },
    {
      title: t('guide_cf_title', 'Codice fiscale'),
      points: [
        t(
          'guide_cf_1',
          '16 characters. For people born abroad, characters 12 to 15 are Z and three digits for the country (Ethiopia is Z315).',
        ),
        t(
          'guide_cf_2',
          'Portals can compute a provisional code, but only the Agenzia delle Entrate or an Italian embassy issues the real one. Use the real one when you have it.',
        ),
      ],
      source: 'https://www.agenziaentrate.gov.it',
    },
    {
      title: t('guide_dov_title', 'Recognition of your degree'),
      points: [
        t(
          'guide_dov_1',
          'Comparability: a Dichiarazione di Valore (DOV) from the Italian embassy, or a CIMEA Statement of Comparability.',
        ),
        t(
          'guide_dov_2',
          'Authenticity: a CIMEA Statement of Verification, legalization, or apostille. Many universities make these optional at pre-enrolment but ask for them at enrolment.',
        ),
      ],
      source: 'https://www.cimea.it',
    },
    {
      title: t(
        'guide_dsu_title',
        'Regional scholarships (DSU: ER.GO, ESU, EDISU, DiSCo, DSU Toscana)',
      ),
      points: [
        t(
          'guide_dsu_1',
          'You need an ISEE parificato, made through a CAF, based on your family composition, income, and property abroad (the year before last).',
        ),
        t(
          'guide_dsu_2',
          'Documents must be issued or legalized by the Italian authorities in your country and translated into Italian. Self-declarations are not accepted.',
        ),
        t(
          'guide_dsu_3',
          'Calls usually open around June and close between July and September. Start the ISEE early: it takes weeks.',
        ),
      ],
      source: 'https://www.er-go.it',
    },
    {
      title: t('guide_maeci_title', 'Italian Government (MAECI) scholarships'),
      points: [
        t(
          'guide_maeci_1',
          "Apply at studyinitaly.esteri.it; the 2026/27 call closed in March. Age limits: 28 for master's, 30 for PhD.",
        ),
        t('guide_maeci_2', 'Italian or English at B2 level. Your passport is needed to register.'),
      ],
      source: 'https://studyinitaly.esteri.it',
    },
    {
      title: t('guide_iyt_title', 'Invest Your Talent in Italy'),
      points: [
        t(
          'guide_iyt_1',
          'Names come from the passport MRZ. English B2, a one-page CV, a video of 59 seconds or less, and your transcript with the GPA.',
        ),
      ],
      source: 'https://investyourtalentapplication.esteri.it',
    },
    {
      title: t('guide_visa_title', 'Visa and residence permit'),
      points: [
        t(
          'guide_visa_1',
          'Embassy checklists ask for a passport valid at least 90 days beyond the visa, with two blank pages. It must also cover your whole stay for the residence permit.',
        ),
        t(
          'guide_visa_2',
          'Apply for the permesso di soggiorno within 8 days of arriving in Italy.',
        ),
      ],
      source: 'https://www.poliziadistato.it',
    },
    {
      title: t('guide_uploads_title', 'Uploads'),
      points: [
        t(
          'guide_uploads_1',
          'PDF is the safe choice. Use file names without accents or special characters. Limits are often 10 MB per file.',
        ),
        t(
          'guide_uploads_2',
          'On some portals (Padua, Polimi) documents can no longer be changed after you submit or pay the fee.',
        ),
      ],
      source: 'https://www.polimi.it',
    },
  ];
}
