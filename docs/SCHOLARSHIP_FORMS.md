# Scholarship and admission forms: what the filler is built on

Research done in September 2026 from the portals' own guides. Every rule in
`src/kb/identityFill.ts` traces back to something here. Dated items come from the 2026/27 calls;
the current call always wins.

## Portals

- **DreamApply** (Padua, Milan Statale, Siena, Florence, Pavia, Bergamo, Parma, Bari, IULM,
  Milano-Bicocca). Tabs: Course, Profile, Contacts, Documents, Checklist.
  - Profile: Given name, Middle name, Family name, Previous family name, Gender, Citizenship,
    Double citizenship, Country of residence.
  - ID document: type (Passport or ID-card), Number, Issue date, Expiry date, Country of issue.
  - Birth: Date, Country, Place.
  - Contacts: Street address, House number ("0" if none), City, Province/region, Postal code,
    Country; phones with the country code, e.g. "+372 12345678".
  - Data model: ISO dates, ISO alpha-2 countries, one-letter gender. Uploads: 10 MiB.
  - Sources: https://www.uniba.it/it/studenti/segreterie-studenti/studenti-stranieri/guide-for-applying-on-the-dreamapply-platform_pdf.pdf,
    https://help.dreamapply.com/api/api_applicants/
- **Universitaly** pre-enrolment (non-EU):
  - Names copied from the passport MRZ, in Latin letters without accents, "XXX" if there's no
    surname; they can't be edited later.
  - Birth date is three dropdowns (Day, Month, Year).
  - Phone with the country code; the codice fiscale only if you have one.
  - Photo and passport uploads: PDF, JPEG, or PNG up to 10 MB. One application per year.
  - Source: https://web.unipd.it/international/wp-content/uploads/2025/04/UNIPD-Universitaly-Pre-enrolment-guide-2025-26.pdf
- **Esse3** (Cineca; used by many Italian universities):
  - "Studente straniero senza Codice Fiscale Italiano" checkbox.
  - Dati personali: Nome, Cognome, Data Nascita (gg/MM/yyyy), Sesso (Maschio/Femmina), Prima
    cittadinanza, and Nazione / Provincia / Comune for the place of birth.
  - Documento: Tipo documento, Numero, Rilasciato da, Data Rilascio, Data Scadenza Validità.
  - Residenza: Nazione, Indirizzo, N° Civico, CAP (only in Italy), and "Domicilio coincide con
    residenza" Sì/No.
  - Recapito: E-mail, E-mail certificata (PEC, a different thing), Pref. Internazionale,
    Cellulare (max 17 characters with the prefix).
  - Source: https://esse3wiki.univpm.it/images/d/d9/Guida_per_la_registrazione.pdf
- **Sapienza Infostud**: gg/mm/aaaa dates. Country names in Italian and in capitals
  ("REPUBBLICA dell' INDIA"). Phone as "+xxx xxxxxxxxxxx" with a space; without the space it's
  rejected.
  - Source: https://web.uniroma1.it/trasparenza/sites/default/files/tutorial_registrazione_infostud_ita.pdf

## Rules the filler follows because of this

| Rule                                                                                             | Why                                                                     |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Phone as `+251 911234567`; national number only when there's a separate prefix field             | Sapienza rejects it without the space; Esse3 has "Pref. Internazionale" |
| Names in Latin letters without accents on "as in passport" fields and ministry portals           | Universitaly, IYT                                                       |
| Nazione / Comune next to the birth date mean the place of birth                                  | Esse3 "Dati personali"                                                  |
| Birth province, PEC, previous or middle names, a third citizenship: left empty                   | They look like the applicant's facts but aren't                         |
| "Numero" under a document heading is the passport number; under an address it's the house number | Esse3, Universitaly                                                     |
| Split the street and house number when the form has both                                         | DreamApply, Esse3                                                       |
| Country dropdowns matched by Italian name, long official name, ISO-2, ISO-3, or option value     | Infostud, DreamApply                                                    |
| Dates from the field's own format (placeholder, example, type="date"); flagged when guessed      | gg/mm/aaaa vs YYYY-MM-DD                                                |

## Codice fiscale

- 16 characters, in this order:
  - surname (3)
  - name (3; with 4 or more consonants, the 1st, 3rd, and 4th)
  - year (2)
  - month letter
  - day (plus 40 for women)
  - place code (4)
  - check letter
- People born abroad get Z and three digits for their country (Ethiopia Z315, India Z222).
- Portals compute a provisional code, but only the Agenzia delle Entrate issues the real one.

The extension validates a code the user enters: its shape, its check letter, and that it matches
the user's names, birth date, and sex. It doesn't generate one.

Source: https://www.agenziaentrate.gov.it/portale/schede/fabbricatiterreni/archivio-comuni-e-stati-esteri/scheda-info-archivio-comuni-e-stati-esteri

## Scholarships and recognition

- **DSU regional scholarships** (ER.GO, ESU Padova, EDISU Piemonte, DiSCo Lazio, DSU Toscana)
  need an ISEE parificato made through a CAF. It covers family composition, income, and property
  abroad.
  - Documents are issued or legalized by the Italian authorities and translated into Italian.
  - Calls open around June and close between July and September.
  - Sources: https://www.er-go.it, https://www.esu.pd.it, https://laziodisco.it
- **MAECI**: studyinitaly.esteri.it; age limits of 28 for master's and 30 for PhD in 2026/27;
  B2 in Italian or English. Source: https://www.esteri.it/wp-content/uploads/2026/03/Bando-26-27-ENG.pdf
- **Invest Your Talent in Italy**: names from the MRZ, English B2, a one-page CV, a video of
  59 seconds or less. Source: https://investyourtalentapplication.esteri.it/SitoIYT/EN/current-call
- **Recognition**:
  - Comparability: DOV or CIMEA Statement of Comparability.
  - Authenticity: CIMEA Statement of Verification, legalization, or apostille.
  - Source: https://www.cimea.it/EN/pagina-attestati-di-comparabilita-e-verifica-dei-titoli
- **Visa**: embassy checklists ask for a passport valid 90 days beyond the visa, with two blank
  pages. The permesso di soggiorno kit is due within 8 days of arrival.
