import { DesignSchema, type Design, type FontKey } from './model';

// Templates are presets over the design controls, as in FlowCV: picking one sets the controls,
// and everything stays editable afterwards. Original designs in common resume style families.

/** Put before the generic family so Amharic (Ethiopic script) renders. 'RD Ethiopic' is declared
 * in doc.css for Ethiopic code points only, so Latin text never falls into an Ethiopic font. */
const ETHIOPIC = "'RD Ethiopic'";

const RAW_FONTS: Record<FontKey, { label: string; stack: string; serif: boolean }> = {
  'public-sans': {
    label: 'Public Sans',
    stack: "'Public Sans Variable', 'Public Sans', Arial, sans-serif",
    serif: false,
  },
  helvetica: {
    label: 'Helvetica / Arial',
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    serif: false,
  },
  georgia: { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif", serif: true },
  palatino: {
    label: 'Palatino',
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
    serif: true,
  },
  garamond: {
    label: 'Garamond',
    stack: "Garamond, 'EB Garamond', 'Times New Roman', serif",
    serif: true,
  },
  times: { label: 'Times', stack: "'Times New Roman', Times, serif", serif: true },
  verdana: { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif', serif: false },
  trebuchet: {
    label: 'Trebuchet',
    stack: "'Trebuchet MS', 'Lucida Grande', sans-serif",
    serif: false,
  },
  tahoma: { label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif', serif: false },
  courier: { label: 'Courier', stack: "'Courier New', Courier, monospace", serif: false },
};

export const FONTS = Object.fromEntries(
  Object.entries(RAW_FONTS).map(([k, f]) => {
    const [head, generic] = [
      f.stack.slice(0, f.stack.lastIndexOf(',')),
      f.stack.slice(f.stack.lastIndexOf(',') + 1).trim(),
    ];
    return [k, { ...f, stack: `${head}, ${ETHIOPIC}, ${generic}` }];
  }),
) as Record<FontKey, { label: string; stack: string; serif: boolean }>;

export interface Template {
  id: string;
  name: string;
  description: string;
  design: Partial<Design>;
}

export const TEMPLATES: Template[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'One column, serif, rules under headings. Safe everywhere.',
    design: {
      columns: 'one',
      font: 'georgia',
      headerAlign: 'center',
      contactStyle: 'bars',
      headingStyle: 'underline',
      headingCase: 'upper',
      accent: '#1f2937',
      datePlacement: 'right',
      subtitleStyle: 'italic',
      photo: 'none',
      skillsLayout: 'inline',
      levelStyle: 'none',
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'One column, clean sans, colored headings and name.',
    design: {
      columns: 'one',
      font: 'public-sans',
      headerAlign: 'left',
      contactStyle: 'icons',
      headingStyle: 'line-after',
      headingCase: 'upper',
      accent: '#1f3c88',
      accentOn: {
        name: true,
        jobTitle: true,
        headings: true,
        headingLine: true,
        dates: false,
        subtitle: false,
        links: true,
        icons: true,
        levels: true,
      },
      datePlacement: 'right',
      subtitleStyle: 'normal',
      skillsLayout: 'grid',
      levelStyle: 'dots',
    },
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description: 'Two columns with a tinted side column for skills and languages.',
    design: {
      columns: 'two',
      sidebar: 'left',
      sideWidth: 32,
      fill: 'sidebar',
      font: 'public-sans',
      headerAlign: 'left',
      contactStyle: 'icons',
      headingStyle: 'plain',
      headingCase: 'upper',
      accent: '#0f766e',
      accentOn: {
        name: false,
        jobTitle: true,
        headings: true,
        headingLine: false,
        dates: false,
        subtitle: false,
        links: true,
        icons: true,
        levels: true,
      },
      datePlacement: 'below',
      skillsLayout: 'list',
      levelStyle: 'bar',
      photo: 'circle',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Lots of white space, small headings, no color.',
    design: {
      columns: 'one',
      font: 'helvetica',
      headerAlign: 'left',
      contactStyle: 'bullets',
      headingStyle: 'plain',
      headingCase: 'capitalize',
      headingSize: 1.05,
      accent: '#111111',
      accentOn: {
        name: false,
        jobTitle: false,
        headings: false,
        headingLine: false,
        dates: false,
        subtitle: false,
        links: false,
        icons: false,
        levels: false,
      },
      datePlacement: 'left',
      subtitleStyle: 'normal',
      skillsLayout: 'inline',
      levelStyle: 'none',
      photo: 'none',
      lineHeight: 1.45,
      sectionSpacing: 14,
    },
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Centered serif header with a colored band.',
    design: {
      columns: 'one',
      font: 'palatino',
      fill: 'header',
      headerAlign: 'center',
      contactStyle: 'bars',
      headingStyle: 'top-line',
      headingCase: 'upper',
      accent: '#7c2d12',
      accentOn: {
        name: false,
        jobTitle: false,
        headings: true,
        headingLine: true,
        dates: true,
        subtitle: false,
        links: true,
        icons: true,
        levels: true,
      },
      datePlacement: 'right',
      subtitleStyle: 'italic',
      skillsLayout: 'bubbles',
      levelStyle: 'none',
      photo: 'none',
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense two columns to fit a lot on one page.',
    design: {
      columns: 'two',
      sidebar: 'right',
      sideWidth: 30,
      fill: 'none',
      font: 'helvetica',
      fontSize: 9,
      lineHeight: 1.25,
      marginX: 12,
      marginY: 10,
      entrySpacing: 4,
      sectionSpacing: 7,
      headerAlign: 'left',
      contactStyle: 'bars',
      headingStyle: 'box',
      headingCase: 'upper',
      headingSize: 1,
      accent: '#334155',
      datePlacement: 'right',
      subtitleStyle: 'bold',
      subtitlePlacement: 'same-line',
      skillsLayout: 'inline',
      levelStyle: 'none',
      photo: 'none',
      nameSize: 22,
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Big name, heavy colored bars on headings.',
    design: {
      columns: 'one',
      font: 'trebuchet',
      headerAlign: 'left',
      contactStyle: 'icons',
      headingStyle: 'bar',
      headingCase: 'upper',
      accent: '#b91c1c',
      accentOn: {
        name: true,
        jobTitle: false,
        headings: true,
        headingLine: true,
        dates: true,
        subtitle: false,
        links: true,
        icons: true,
        levels: true,
      },
      nameSize: 32,
      datePlacement: 'right',
      subtitleStyle: 'bold',
      skillsLayout: 'bubbles',
      levelStyle: 'none',
      photo: 'rounded',
    },
  },
  {
    id: 'academic',
    name: 'Academic',
    description: 'Formal serif CV for scholarships and research: dates in a left column.',
    design: {
      columns: 'one',
      font: 'times',
      fontSize: 10.5,
      headerAlign: 'center',
      contactStyle: 'lines',
      headingStyle: 'underline',
      headingCase: 'capitalize',
      headingSize: 1.2,
      accent: '#1e3a5f',
      accentOn: {
        name: false,
        jobTitle: false,
        headings: true,
        headingLine: true,
        dates: false,
        subtitle: false,
        links: true,
        icons: false,
        levels: true,
      },
      datePlacement: 'left',
      subtitleStyle: 'italic',
      skillsLayout: 'list',
      levelStyle: 'text',
      photo: 'none',
      dateFormat: 'MM/YYYY',
    },
  },
];

/** A full design from a template id, keeping the page format the user chose. */
export function applyTemplate(
  id: string,
  keep?: Partial<Pick<Design, 'page' | 'docLang'>>,
): Design {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[1]!;
  return DesignSchema.parse({ ...t.design, template: t.id, ...(keep ?? {}) });
}
