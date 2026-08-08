/**
 * Serve dist/ the way Cloudflare Pages does — including the rules in _headers.
 *
 * This exists so the smoke tests hit the real Content-Security-Policy. A plain
 * static server, or `astro preview`, ignores _headers entirely, and would have
 * happily shown a working cost counter while production showed zero: the bug
 * was the policy, not the page. A test that does not apply the headers cannot
 * see it.
 *
 *   node scripts/serve-dist.mjs [port]
 *
 * Only the parts of the _headers syntax this site uses are implemented: a path
 * pattern on its own line, followed by indented `Name: value` pairs, with `*`
 * matching within a path segment or across the rest of the path.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

/** Parse _headers into [{ test, headers }] in file order. */
async function loadRules() {
  let text = '';
  try {
    text = await readFile(join(DIST, '_headers'), 'utf8');
  } catch {
    return [];
  }
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      const source = `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
      rules.push({ test: new RegExp(source), headers: [] });
      continue;
    }
    const at = line.indexOf(':');
    if (at > 0 && rules.length) {
      rules.at(-1).headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
  return rules;
}

const rules = await loadRules();

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // normalize() before joining, so ../ cannot climb out of dist.
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel.endsWith('/') ? `${rel}index.html` : rel);

  let body;
  try {
    body = await readFile(file);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('not found');
    return;
  }

  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  for (const rule of rules) {
    if (!rule.test.test(path)) continue;
    for (const [name, value] of rule.headers) res.setHeader(name, value);
  }
  res.end(body);
}).listen(PORT, () => {
  console.log(`serving dist on http://localhost:${PORT} with ${rules.length} header rule(s)`);
});
