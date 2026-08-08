/**
 * Post-build guards.
 *
 * This site's whole value is that its diagrams and numbers are right, and both
 * are generated from arithmetic that no type checker looks at. A ring rendered
 * at height="-40" type-checks perfectly and disappears in the browser, which is
 * how the innermost boundary went missing once already. These checks exist so
 * that class of failure fails the build instead of shipping.
 *
 * Run automatically after `npm run build`.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const CONTENT = new URL('../src/content/topics/', import.meta.url).pathname;
const LANGS = ['en', 'ja'];

const failures = [];
const notes = [];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// 1. SVG geometry that browsers reject silently.
const html = (await walk(DIST)).filter((f) => f.endsWith('.html'));
for (const file of html) {
  const body = await readFile(file, 'utf8');
  const where = relative(DIST, file);

  for (const attr of ['width', 'height', 'r', 'rx', 'ry']) {
    const bad = body.match(new RegExp(`${attr}="-[\\d.]+"`, 'g'));
    if (bad) {
      failures.push(`${where}: negative SVG ${attr} (${[...new Set(bad)].join(', ')})`);
    }
  }

  if (/(?:x|y|width|height|cx|cy)="NaN"/.test(body)) {
    failures.push(
      `${where}: NaN in an SVG coordinate: a layout formula divided by something empty`,
    );
  }
}

// 2. Translation parity. A topic that exists in one language only produces a
//    dead end for readers in the other.
const bySlug = new Map();
for (const lang of LANGS) {
  let files = [];
  try {
    files = await readdir(join(CONTENT, lang));
  } catch {
    failures.push(`missing content directory for locale "${lang}"`);
    continue;
  }
  for (const f of files.filter((f) => f.endsWith('.mdx'))) {
    const slug = f.replace(/\.mdx$/, '');
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), lang]);
  }
}
for (const [slug, langs] of bySlug) {
  if (langs.length !== LANGS.length) {
    // Not fatal: the language switcher greys out the missing side. But it should
    // never be a surprise, so it is always reported.
    notes.push(`topic "${slug}" exists only in: ${langs.join(', ')}`);
  }
}

// 3. Every topic must carry a checked date and cite its sources.
//
//    Both are read from the frontmatter alone. Matching against the whole file
//    would let a `checked:` line in prose satisfy the rule, and the sources
//    check exists because CI probes the URLs an article lists but has no way to
//    notice an article that lists none: the citations would simply never be
//    checked, silently, which is the failure this whole pair guards against.
for (const lang of LANGS) {
  let files = [];
  try {
    files = await readdir(join(CONTENT, lang));
  } catch {
    continue;
  }
  for (const f of files.filter((f) => f.endsWith('.mdx'))) {
    const body = await readFile(join(CONTENT, lang, f), 'utf8');
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (frontmatter === undefined) {
      failures.push(`${lang}/${f}: no frontmatter block`);
      continue;
    }

    const m = frontmatter.match(/^checked:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    if (!m) {
      failures.push(`${lang}/${f}: no "checked" date in frontmatter`);
    } else if (Number.isNaN(Date.parse(m[1]))) {
      failures.push(`${lang}/${f}: unparseable checked date "${m[1]}"`);
    }

    // Sliced rather than matched: under /m a $ anchors to a line end, so a lazy
    // match stops on the sources: line itself and reads every article as bare.
    const at = frontmatter.search(/^sources:/m);
    const sources = at < 0 ? '' : frontmatter.slice(at);
    if (!/https:\/\//.test(sources)) {
      failures.push(`${lang}/${f}: cites no AWS sources`);
    }
  }
}

// 4. Every inline script must be allowed by the shipped CSP.
//
//    `script-src 'self'` blocks inline scripts, and Astro emits small ones
//    inline rather than as files. That combination shipped a home page whose
//    live cost counter never started and a services page whose filter did
//    nothing, with valid HTML and a green build. scripts/csp-hashes.mjs adds
//    the hashes after the build; this checks it actually did.
{
  const headers = await readFile(join(DIST, '_headers'), 'utf8').catch(() => '');
  const policy = headers.match(/script-src [^;\n]*/)?.[0] ?? '';
  const seen = new Map();

  for (const file of html) {
    const body = await readFile(file, 'utf8');
    for (const [, script] of body.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`;
      if (!seen.has(hash)) seen.set(hash, relative(DIST, file));
    }
  }

  if (seen.size > 0 && !policy) {
    failures.push(`${seen.size} inline script(s) but no script-src in dist/_headers`);
  }
  for (const [hash, where] of seen) {
    if (!policy.includes(hash)) {
      failures.push(`inline script in ${where} is blocked by the CSP (missing '${hash}')`);
    }
  }
}

for (const n of notes) console.warn(`  note  ${n}`);

if (failures.length) {
  console.error(`\n  ${failures.length} build check failure(s):`);
  for (const f of failures) console.error(`  fail  ${f}`);
  process.exit(1);
}

console.log(`  build checks passed (${html.length} pages, ${bySlug.size} topics)`);
