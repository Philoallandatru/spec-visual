import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const sourceRoot = resolve(root, '../_source/pages');
const port = Number(process.argv[2] || process.env.PORT || 5181);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function isWithin(base, path) {
  const rel = relative(base, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export async function serve(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const source = /^\/sources\/base\/(page-\d{3}\.md)$/.exec(path);
    const base = source ? sourceRoot : root;
    if (path.endsWith('/')) path += 'index.html';
    const candidate = resolve(base, source ? source[1] : '.' + path);
    if (!isWithin(base, candidate)) { res.writeHead(403).end('Forbidden'); return; }
    const file = await realpath(candidate);
    if (!isWithin(await realpath(base), file)) { res.writeHead(403).end('Forbidden'); return; }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer(serve).listen(port, '127.0.0.1', () => console.log(`NVMe visual lab: http://127.0.0.1:${port}/`));
}
