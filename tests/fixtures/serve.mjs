// Static server for E2E fixture pages. Two ports so cross-origin iframes can be tested.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, 'pages');
const modules = join(import.meta.dirname, '../../node_modules');

// Framework fixtures are served from local packages, never a CDN (spec 16.2).
const VENDOR = {
  '/vendor/vue.js': join(modules, 'vue/dist/vue.esm-browser.prod.js'),
  '/vendor/quill.js': join(modules, 'quill/dist/quill.js'),
  '/vendor/quill.snow.css': join(modules, 'quill/dist/quill.snow.css'),
};
const bundles = {};
{
  const esbuild = await import('esbuild');
  const out = await esbuild.build({
    entryPoints: [join(import.meta.dirname, 'react/app.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  bundles['/bundles/react-form.js'] = out.outputFiles[0].text;
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};
const ports = (process.env.FIXTURE_PORTS ?? '4610,4611').split(',').map(Number);

for (const port of ports) {
  createServer(async (req, res) => {
    // The second origin stands in for a JS-only site: no llms.txt there.
    if (port !== ports[0] && req.url === '/llms.txt')
      return void res.writeHead(404).end('not found');
    if (bundles[req.url]) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return void res.end(bundles[req.url]);
    }
    if (VENDOR[req.url]) {
      res.writeHead(200, { 'content-type': types[extname(VENDOR[req.url])] ?? 'text/javascript' });
      return void res.end(await readFile(VENDOR[req.url]));
    }
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    try {
      const body = await readFile(join(root, path.endsWith('/') ? `${path}index.html` : path));
      res.writeHead(200, {
        'content-type':
          types[path.endsWith('/') ? '.html' : extname(path)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(port, '127.0.0.1');
}
console.log(`fixtures on ${ports.join(', ')}`);
