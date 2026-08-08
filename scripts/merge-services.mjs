/**
 * Merge a batch of researched services into the per-category dataset.
 *
 * Research arrives as one flat array covering several categories at once, while
 * the dataset is stored one file per category. Doing that by hand is how slugs
 * end up duplicated across files, which the Catalogue then refuses to load.
 *
 *   node scripts/merge-services.mjs batch.json [--replace]
 *
 * Without --replace an incoming record whose slug already exists is skipped and
 * reported. With --replace it overwrites, which is what a verification pass
 * wants. Either way nothing is silently dropped.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const [, , batchPath, ...flags] = process.argv;
const replace = flags.includes('--replace');

if (!batchPath) {
  console.error('usage: node scripts/merge-services.mjs <batch.json> [--replace]');
  process.exit(2);
}

const DIR = new URL('../src/data/services/', import.meta.url).pathname;

// Vendor prefixes vary between research passes; identity must not.
const normalise = (slug) =>
  String(slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^(amazon|aws)-(?=.)/, '')
    .replace(/^-+|-+$/g, '');

const incoming = JSON.parse(await readFile(batchPath, 'utf8'));
if (!Array.isArray(incoming)) {
  console.error('batch must be a JSON array of service records');
  process.exit(1);
}

// Index every slug already in the dataset so a collision in *another* category
// is caught too, not just one in the file we happen to be writing.
const files = new Map();
const owner = new Map();
for (const category of [
  'compute',
  'storage',
  'database',
  'networking',
  'security',
  'integration',
  'management',
  'analytics',
]) {
  const path = `${DIR}${category}.json`;
  const rows = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : [];
  files.set(category, rows);
  for (const row of rows) owner.set(normalise(row.slug), category);
}

let added = 0;
let replaced = 0;
const skipped = [];

for (const raw of incoming) {
  const slug = normalise(raw.slug);
  const record = { ...raw, slug };
  const category = record.category;

  if (!files.has(category)) {
    skipped.push(`${slug}: unknown category "${category}"`);
    continue;
  }

  const existingCategory = owner.get(slug);
  if (existingCategory) {
    if (!replace) {
      skipped.push(`${slug}: already in ${existingCategory}.json`);
      continue;
    }
    const rows = files.get(existingCategory);
    files.set(
      existingCategory,
      rows.map((r) => (normalise(r.slug) === slug ? record : r)),
    );
    replaced += 1;
    continue;
  }

  files.get(category).push(record);
  owner.set(slug, category);
  added += 1;
}

for (const [category, rows] of files) {
  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(`${DIR}${category}.json`, `${JSON.stringify(rows, null, 2)}\n`);
}

const total = [...files.values()].reduce((n, rows) => n + rows.length, 0);
console.log(`added ${added}, replaced ${replaced}, skipped ${skipped.length}: ${total} total`);
for (const s of skipped) console.log(`  skip  ${s}`);
