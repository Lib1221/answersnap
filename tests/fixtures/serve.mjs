// Static server for E2E fixture pages. Two ports so cross-origin iframes can be tested.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, 'pages');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const ports = (process.env.FIXTURE_PORTS ?? '4610,4611').split(',').map(Number);

for (const port of ports) {
  createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    try {
      const body = await readFile(join(root, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(port, '127.0.0.1');
}
console.log(`fixtures on ${ports.join(', ')}`);
