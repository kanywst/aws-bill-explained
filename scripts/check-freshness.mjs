/**
 * How old is what this site claims?
 *
 * check-sources asks whether a citation still resolves, which is a question
 * about the link. This asks a question about the claim. AWS changes pricing
 * without moving a page: the Support plan lineup was replaced while every URL
 * describing it stayed at 200, and a record naming the old plans passed every
 * check in this repo. A link checker cannot see that. A date can.
 *
 * Warns past STALE_DAYS and fails past EXPIRED_DAYS, so a record that nobody
 * has revisited in half a year stops the build rather than quietly ageing.
 *
 *   node scripts/check-freshness.mjs [--json]
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = new URL('../src/data/services/', import.meta.url).pathname;
const TOPICS = new URL('../src/content/topics/', import.meta.url).pathname;

const STALE_DAYS = 90;
const EXPIRED_DAYS = 180;
const DAY = 86_400_000;

// Taken from the newest date in the dataset rather than the clock, so the
// result is reproducible: the same commit gives the same answer whenever CI
// happens to run, and a rebuild months later does not fail on its own.
const entries = [];

for (const file of (await readdir(DATA)).filter((f) => f.endsWith('.json'))) {
  for (const record of JSON.parse(await readFile(join(DATA, file), 'utf8'))) {
    entries.push({ id: record.slug, kind: 'service', checked: record.checked });
  }
}

for (const lang of await readdir(TOPICS)) {
  let files;
  try {
    files = (await readdir(join(TOPICS, lang))).filter((f) => f.endsWith('.mdx'));
  } catch {
    continue;
  }
  for (const file of files) {
    const body = await readFile(join(TOPICS, lang, file), 'utf8');
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const checked = frontmatter.match(/^checked:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
    entries.push({ id: `${lang}/${file.replace(/\.mdx$/, '')}`, kind: 'article', checked });
  }
}

const undated = entries.filter((e) => !e.checked || Number.isNaN(Date.parse(e.checked)));
const dated = entries.filter((e) => !undated.includes(e));
const newest = Math.max(...dated.map((e) => Date.parse(e.checked)));
const age = (e) => Math.round((newest - Date.parse(e.checked)) / DAY);

const expired = dated.filter((e) => age(e) > EXPIRED_DAYS).sort((a, b) => age(b) - age(a));
const stale = dated
  .filter((e) => age(e) > STALE_DAYS && age(e) <= EXPIRED_DAYS)
  .sort((a, b) => age(b) - age(a));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ expired, stale, undated }, null, 2));
} else {
  const oldest = dated.reduce((a, b) => (age(a) >= age(b) ? a : b));
  console.log(
    `${dated.length} dated claims, newest ${new Date(newest).toISOString().slice(0, 10)}, ` +
      `oldest ${age(oldest)} day(s) behind it (${oldest.id})`,
  );
  for (const e of stale) console.warn(`  stale  ${e.kind} ${e.id}: ${age(e)} days behind`);
  for (const e of expired) console.error(`  EXPIRED ${e.kind} ${e.id}: ${age(e)} days behind`);
  for (const e of undated) console.error(`  EXPIRED ${e.kind} ${e.id}: no usable checked date`);
}

process.exit(expired.length + undated.length > 0 ? 1 : 0);
