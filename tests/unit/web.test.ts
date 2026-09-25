import { describe, expect, it } from 'vitest';
import {
  jsonLdPersonText,
  normalizeUrl,
  originPattern,
  originPatterns,
  parseHtmlPage,
} from '@/kb/web';

const HTML = `<!doctype html><html><head>
  <title>Jamie Park | Backend Engineer</title>
  <meta name="description" content="Backend engineer building payment APIs with Python and Django.">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"Jamie Park"},
    {"@type":"Person","name":"Jamie Park","jobTitle":"Backend Engineer","email":"mailto:jamie.park@example.com",
     "knowsAbout":["Python","Django"],"sameAs":["https://github.com/jamiepark-example"]}]}</script>
</head><body>
  <nav><a href="/">Home</a><a href="/about">About</a><a href="/projects?tab=all#top">Projects</a></nav>
  <main><article><h1>Hi, I'm Jamie</h1>
    <p>I build payment reconciliation APIs at Ledgerly with Django REST Framework. Before that I wrote ETL pipelines at Brightpath Analytics. I also mentor learners at Data Science for Everyone, a nonprofit that teaches Python and data analysis.</p>
    <p><a href="/files/jamie-park-resume.pdf">Download my resume</a> <a href="/logo.png">logo</a>
    <a href="https://other.example/x">Elsewhere</a> <a href="/blog/first-post">Blog</a></p>
  </article></main>
  <div aria-hidden="true">decorative duplicate text</div>
  <footer>© Jamie</footer>
</body></html>`;

describe('parseHtmlPage', () => {
  const page = parseHtmlPage(HTML, 'https://jamiepark.example/');

  it('reads the article, the meta description, and JSON-LD Person inside @graph', () => {
    expect(page.title).toBe('Jamie Park | Backend Engineer');
    expect(page.text).toContain('Backend engineer building payment APIs');
    expect(page.text).toContain('Job title: Backend Engineer');
    expect(page.text).toContain('Email: jamie.park@example.com');
    expect(page.text).toContain('Knows about: Python, Django');
    expect(page.text).toContain('payment reconciliation APIs at Ledgerly');
    expect(page.text).not.toContain('decorative duplicate');
    expect(page.text).not.toContain('© Jamie');
  });

  it('collects same-origin pages without anchors, queries, or assets, and resume PDFs separately', () => {
    expect(page.links.sort()).toEqual([
      'https://jamiepark.example/about',
      'https://jamiepark.example/blog/first-post',
      'https://jamiepark.example/projects',
    ]);
    expect(page.resumeLinks).toEqual(['https://jamiepark.example/files/jamie-park-resume.pdf']);
  });
});

describe('jsonLdPersonText', () => {
  it('ignores broken JSON-LD', () => {
    const doc = new DOMParser().parseFromString(
      '<script type="application/ld+json">{nope</script>',
      'text/html',
    );
    expect(jsonLdPersonText(doc)).toBe('');
  });
});

describe('urls', () => {
  it('normalizes input and builds origin patterns', () => {
    expect(normalizeUrl('jamiepark.example/about#x')).toBe('https://jamiepark.example/about');
    expect(originPattern('https://www.jamiepark.example/resume')).toBe(
      'https://www.jamiepark.example/*',
    );
  });

  it('asks for the www and apex twins together, since sites redirect between them', () => {
    expect(originPatterns('https://jamiepark.example/')).toEqual([
      'https://jamiepark.example/*',
      'https://www.jamiepark.example/*',
    ]);
    expect(originPatterns('https://www.jamiepark.example/')).toEqual([
      'https://www.jamiepark.example/*',
      'https://jamiepark.example/*',
    ]);
    expect(originPatterns('http://127.0.0.1:4610/site/')).toEqual(['http://127.0.0.1:4610/*']);
  });
});
