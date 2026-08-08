/**
 * How old is what this site claims?
 *
 * check-sources asks whether a citation still resolves, which is a question
 * about the link. This asks a question about the claim. AWS changes pricing
 * without moving a page: the Support plan lineup was replaced while every URL
 * describing it stayed at 200, and a record naming the old plans passed every
 * check in this repo. A link checker cannot see that. A date can.
 *
 * Ages are measured against today, and --strict turns the oldest of them into
 * a failure. The first version measured against the newest date in the dataset
 * instead, for reproducibility — which quietly defeated the whole point: when
 * every claim ages together, nothing is ever behind anything, and a repository
 * untouched for two years reported "0 days behind". A staleness check whose
 * answer does not change as time passes is not a staleness check.
 *
 * Reporting is the default because a push that changes one component should
 * not fail on the age of an unrelated record. The weekly sweep passes --strict,
 * so age is enforced on a clock rather than on whoever happens to commit.
 *
 *   node scripts/check-freshness.mjs [--strict] [--json] [--now=YYYY-MM-DD]
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = new URL('../src/data/services/', import.meta.url).pathname;
const TOPICS = new URL('../src/content/topics/', import.meta.url).pathname;

const STALE_DAYS = 90;
const EXPIRED_DAYS = 180;
const DAY = 86_400_000;

const strict = process.argv.includes('--strict');
// --now exists so the tests can pin a date; everything else uses the clock.
const pinned = process.argv.find((a) => a.startsWith('--now='))?.slice('--now='.length);
const today = pinned ? Date.parse(pinned) : Date.now();

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
const age = (e) => Math.round((today - Date.parse(e.checked)) / DAY);

const expired = dated.filter((e) => age(e) > EXPIRED_DAYS).sort((a, b) => age(b) - age(a));
const stale = dated
  .filter((e) => age(e) > STALE_DAYS && age(e) <= EXPIRED_DAYS)
  .sort((a, b) => age(b) - age(a));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ expired, stale, undated }, null, 2));
} else {
  const oldest = dated.reduce((a, b) => (age(a) >= age(b) ? a : b));
  console.log(
    `${dated.length} dated claims as of ${new Date(today).toISOString().slice(0, 10)}, ` +
      `oldest is ${age(oldest)} day(s) old (${oldest.id})`,
  );
  for (const e of stale) console.warn(`  stale  ${e.kind} ${e.id}: ${age(e)} days behind`);
  for (const e of expired) console.error(`  EXPIRED ${e.kind} ${e.id}: ${age(e)} days behind`);
  for (const e of undated) console.error(`  EXPIRED ${e.kind} ${e.id}: no usable checked date`);
}

const failing = expired.length + undated.length;
if (failing > 0 && !strict) {
  console.warn(
    `  ${failing} claim(s) past ${EXPIRED_DAYS} days — run with --strict to fail on this`,
  );
}
process.exit(strict && failing > 0 ? 1 : 0);
