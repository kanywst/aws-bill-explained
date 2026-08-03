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
      `${where}: NaN in an SVG coordinate — a layout formula divided by something empty`,
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

// 3. Every topic must carry a checked date, and it must be plausible.
for (const lang of LANGS) {
  let files = [];
  try {
    files = await readdir(join(CONTENT, lang));
  } catch {
    continue;
  }
  for (const f of files.filter((f) => f.endsWith('.mdx'))) {
    const body = await readFile(join(CONTENT, lang, f), 'utf8');
    const m = body.match(/^checked:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    if (!m) {
      failures.push(`${lang}/${f}: no "checked" date in frontmatter`);
      continue;
    }
    if (Number.isNaN(Date.parse(m[1]))) {
      failures.push(`${lang}/${f}: unparseable checked date "${m[1]}"`);
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
