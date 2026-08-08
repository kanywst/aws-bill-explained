/**
 * Add the built inline scripts' hashes to the Content-Security-Policy.
 *
 * The CSP in public/_headers says `script-src 'self'`, which is the right
 * policy and which silently broke the site: Astro emits a small script inline
 * rather than as a file, the browser refused to run it, and the home page's
 * live cost counter (the first thing anyone sees) sat at zero. Nothing in the
 * build noticed, because the HTML was perfectly valid.
 *
 * The fix is not to allow 'unsafe-inline', which would defeat the directive
 * entirely. It is to hash exactly the scripts we shipped. Those hashes change
 * whenever the code does, so they are generated here rather than pasted in, and
 * check-build.mjs fails the build if any inline script is missing from the
 * policy.
 *
 * Runs after `astro build`, against dist/_headers.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const HEADERS = join(DIST, '_headers');

/** Every inline <script> in the build, by hash. `src=` ones are already files. */
export const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

export async function walkHtml(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkHtml(p)));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

export async function collectHashes(dist) {
  const hashes = new Map();
  for (const file of await walkHtml(dist)) {
    const html = await readFile(file, 'utf8');
    for (const [, body] of html.matchAll(INLINE_SCRIPT)) {
      const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
      if (!hashes.has(hash)) hashes.set(hash, relative(dist, file));
    }
  }
  return hashes;
}

const hashes = await collectHashes(DIST);

let headers;
try {
  headers = await readFile(HEADERS, 'utf8');
} catch {
  console.error('  csp: dist/_headers is missing, so the policy would not ship at all');
  process.exit(1);
}

if (!/script-src 'self'/.test(headers)) {
  console.error("  csp: no `script-src 'self'` in dist/_headers to extend");
  process.exit(1);
}

// Sorted so a rebuild with unchanged code produces an unchanged file.
const sources = [...hashes.keys()].sort();
const updated = headers.replace(
  /script-src 'self'[^;]*/,
  `script-src 'self'${sources.map((h) => ` '${h}'`).join('')}`,
);
await writeFile(HEADERS, updated);

console.log(`  csp: allowed ${sources.length} inline script(s) by hash`);
for (const [hash, where] of hashes) console.log(`       ${hash}  first seen in ${where}`);
