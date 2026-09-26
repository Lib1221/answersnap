import type { SectionType } from './model';

// The resume's own language: default section titles, "Present", and level words. Month names
// come from Intl in the same language. Italian matters for Italian university and scholarship CVs.

export const DOC_LANGS = ['en', 'it', 'fr', 'es', 'de'] as const;
export type DocLang = (typeof DOC_LANGS)[number];

export const DOC_LANG_NAMES: Record<DocLang, string> = {
  en: 'English',
  it: 'Italiano',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
};

interface DocStrings {
  sections: Record<SectionType, string>;
  present: string;
  /** Skill levels 1 to 5 (FlowCV's scale). */
  skillLevels: string[];
  /** Language levels 1 to 5. */
  languageLevels: string[];
  /** Consent line many Italian and EU applications require at the end of a CV. */
  consent: string;
}

export const DOC_STRINGS: Record<DocLang, DocStrings> = {
  en: {
    sections: {
      profile: 'Profile',
      experience: 'Professional Experience',
      education: 'Education',
      skills: 'Skills',
      languages: 'Languages',
      certificates: 'Certificates',
      projects: 'Projects',
      courses: 'Courses',
      awards: 'Awards',
      organisations: 'Organisations',
      publications: 'Publications',
      volunteering: 'Volunteering',
      references: 'References',
      interests: 'Interests',
      declaration: 'Declaration',
      custom: 'Custom section',
    },
    present: 'Present',
    skillLevels: ['Beginner', 'Amateur', 'Competent', 'Proficient', 'Expert'],
    languageLevels: ['Basic', 'Conversational', 'Proficient', 'Fluent', 'Native or bilingual'],
    consent:
      'I authorize the processing of my personal data in accordance with Regulation (EU) 2016/679 (GDPR).',
  },
  it: {
    sections: {
      profile: 'Profilo',
      experience: 'Esperienza professionale',
      education: 'Istruzione e formazione',
      skills: 'Competenze',
      languages: 'Lingue',
      certificates: 'Certificazioni',
      projects: 'Progetti',
      courses: 'Corsi',
      awards: 'Premi e riconoscimenti',
      organisations: 'Organizzazioni',
      publications: 'Pubblicazioni',
      volunteering: 'Volontariato',
      references: 'Referenze',
      interests: 'Interessi',
      declaration: 'Dichiarazione',
      custom: 'Sezione personalizzata',
    },
    present: 'Oggi',
    skillLevels: ['Principiante', 'Base', 'Intermedio', 'Avanzato', 'Esperto'],
    languageLevels: ['Base', 'Elementare', 'Intermedio', 'Fluente', 'Madrelingua'],
    consent:
      'Autorizzo il trattamento dei miei dati personali ai sensi del D.Lgs. 196/2003 e del Regolamento UE 2016/679 (GDPR).',
  },
  fr: {
    sections: {
      profile: 'Profil',
      experience: 'Expérience professionnelle',
      education: 'Formation',
      skills: 'Compétences',
      languages: 'Langues',
      certificates: 'Certificats',
      projects: 'Projets',
      courses: 'Cours',
      awards: 'Distinctions',
      organisations: 'Organisations',
      publications: 'Publications',
      volunteering: 'Bénévolat',
      references: 'Références',
      interests: "Centres d'intérêt",
      declaration: 'Déclaration',
      custom: 'Section personnalisée',
    },
    present: "Aujourd'hui",
    skillLevels: ['Débutant', 'Notions', 'Compétent', 'Avancé', 'Expert'],
    languageLevels: ['Notions', 'Conversationnel', 'Courant', 'Bilingue', 'Langue maternelle'],
    consent:
      "J'autorise le traitement de mes données personnelles conformément au Règlement (UE) 2016/679 (RGPD).",
  },
  es: {
    sections: {
      profile: 'Perfil',
      experience: 'Experiencia profesional',
      education: 'Formación',
      skills: 'Habilidades',
      languages: 'Idiomas',
      certificates: 'Certificados',
      projects: 'Proyectos',
      courses: 'Cursos',
      awards: 'Premios',
      organisations: 'Organizaciones',
      publications: 'Publicaciones',
      volunteering: 'Voluntariado',
      references: 'Referencias',
      interests: 'Intereses',
      declaration: 'Declaración',
      custom: 'Sección personalizada',
    },
    present: 'Actualidad',
    skillLevels: ['Principiante', 'Básico', 'Competente', 'Avanzado', 'Experto'],
    languageLevels: ['Básico', 'Conversacional', 'Competente', 'Fluido', 'Nativo o bilingüe'],
    consent:
      'Autorizo el tratamiento de mis datos personales conforme al Reglamento (UE) 2016/679 (RGPD).',
  },
  de: {
    sections: {
      profile: 'Profil',
      experience: 'Berufserfahrung',
      education: 'Ausbildung',
      skills: 'Kenntnisse',
      languages: 'Sprachen',
      certificates: 'Zertifikate',
      projects: 'Projekte',
      courses: 'Kurse',
      awards: 'Auszeichnungen',
      organisations: 'Organisationen',
      publications: 'Publikationen',
      volunteering: 'Ehrenamt',
      references: 'Referenzen',
      interests: 'Interessen',
      declaration: 'Erklärung',
      custom: 'Eigener Abschnitt',
    },
    present: 'Heute',
    skillLevels: ['Anfänger', 'Grundkenntnisse', 'Fortgeschritten', 'Sehr gut', 'Experte'],
    languageLevels: [
      'Grundkenntnisse',
      'Gute Kenntnisse',
      'Sehr gute Kenntnisse',
      'Fließend',
      'Muttersprache',
    ],
    consent:
      'Ich willige in die Verarbeitung meiner personenbezogenen Daten gemäß der Verordnung (EU) 2016/679 (DSGVO) ein.',
  },
};

const monthCache = new Map<string, string[]>();
/** Month names in the resume's language: long or short. */
export function monthNames(lang: DocLang, style: 'long' | 'short'): string[] {
  const key = `${lang}:${style}`;
  let names = monthCache.get(key);
  if (!names) {
    const fmt = new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' });
    names = Array.from({ length: 12 }, (_, m) => {
      const s = fmt.format(new Date(Date.UTC(2020, m, 15))).replace(/\.$/, '');
      return s.charAt(0).toUpperCase() + s.slice(1);
    });
    monthCache.set(key, names);
  }
  return names;
}
