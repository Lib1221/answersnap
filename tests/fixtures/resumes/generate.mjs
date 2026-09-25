// Regenerates the PDF resume fixtures with Chromium (fictional Jamie Park only).
//   node tests/fixtures/resumes/generate.mjs   (E2E_CHROMIUM_PATH works here too)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = import.meta.dirname;
const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.goto(`file://${join(dir, 'source.html')}`);

// Text PDF with a browser-style print header and footer on every page, like a web resume
// saved with Ctrl+P.
const header =
  '<div style="font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>9/25/26, 1:40 PM</span><span>Resume | Jamie Park</span></div>';
const footer =
  '<div style="font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>https://jamiepark.example/resume</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>';
writeFileSync(
  join(dir, 'jamie-park.pdf'),
  await page.pdf({
    format: 'A4',
    margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: header,
    footerTemplate: footer,
  }),
);

// "Scanned" PDF: the first page as an image only, no text layer.
await page.setViewportSize({ width: 820, height: 1100 });
const png = await page.screenshot();
await page.setContent(
  `<img src="data:image/png;base64,${png.toString('base64')}" style="width:100%">`,
);
writeFileSync(join(dir, 'jamie-park-scanned.pdf'), await page.pdf({ format: 'A4' }));
await browser.close();
console.log(
  'wrote jamie-park.pdf and jamie-park-scanned.pdf',
  readFileSync(join(dir, 'jamie-park.pdf')).length,
);
