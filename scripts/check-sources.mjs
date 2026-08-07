/**
 * Check that every cited AWS source still resolves.
 *
 * The site's whole claim is that each classification is backed by a primary
 * AWS page. A citation that 404s is not a broken-link nit, it is a claim with
 * nothing behind it — and AWS retires pages often enough that this has already
 * happened once in this dataset.
 *
 * Reports rather than fails, because a transient AWS outage should not turn CI
 * red. The exit code is non-zero only when something is unambiguously gone.
 */
import { readdir, readFile } from 'node:fs/promises';

const DIR = new URL('../src/data/services/', import.meta.url).pathname;
const TOPICS = new URL('../src/content/topics/', import.meta.url).pathname;
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
const services = (
  await Promise.all(files.map(async (f) => JSON.parse(await readFile(DIR + f, 'utf8'))))
).flat();

/** One check per distinct URL, remembering who cited it. */
const citedBy = new Map();
const cite = (url, who) => citedBy.set(url, [...(citedBy.get(url) ?? []), who]);

for (const service of services) {
  for (const url of service.sources ?? []) cite(url, service.slug);
}

/**
 * Articles cite too. They used to carry nothing but a `checked` date, which
 * meant the longest-form claims on the site were the only ones no link check
 * ever saw. Frontmatter is read with a deliberately dumb scanner rather than a
 * YAML dependency — the shape is a flat list of quoted URLs and nothing else.
 */
let topicCount = 0;
for (const lang of await readdir(TOPICS)) {
  for (const file of (await readdir(TOPICS + lang)).filter((f) => f.endsWith('.mdx'))) {
    const body = await readFile(`${TOPICS}${lang}/${file}`, 'utf8');
    const frontmatter = body.split('---')[1] ?? '';
    // Scanned line by line rather than with one regex: `sources:` is the last
    // key, so any pattern that needs a following top-level line never matches
    // and the whole check silently reports zero articles.
    const urls = [];
    let inSources = false;
    for (const line of frontmatter.split('\n')) {
      if (/^sources:\s*$/.test(line)) {
        inSources = true;
        continue;
      }
      if (!inSources) continue;
      const item = line.match(/^\s+-\s*['"]?(https:\/\/[^\s'"]+)/);
      if (item) urls.push(item[1]);
      else if (/^\S/.test(line)) inSources = false;
    }
    if (urls.length) topicCount += 1;
    for (const url of urls) cite(url, `${lang}/${file.replace(/\.mdx$/, '')}`);
  }
}

const urls = [...citedBy.keys()].sort();
console.log(
  `checking ${urls.length} distinct sources across ${services.length} services and ${topicCount} articles`,
);

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD first; some AWS pages reject it, so fall back to a ranged GET
    // rather than downloading the whole document.
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-1024' },
        signal: controller.signal,
      });
    }
    return { url, status: res.status, finalUrl: res.url };
  } catch (error) {
    return { url, status: 0, error: String(error?.name ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  results.push(...(await Promise.all(urls.slice(i, i + CONCURRENCY).map(probe))));
}

/**
 * A retired AWS documentation page does not 404. It 200s, having redirected to
 * the guide's index — so status alone passes citations that are actually gone.
 * Comparing the final URL to the requested one is what catches those. Ignore
 * the cosmetic differences (trailing slash, ?icmpid tracking, locale segment)
 * so this reports real relocations rather than every redirect.
 */
const canonical = (u) =>
  u
    .replace(/[?#].*$/, '')
    .replace(/\/(?:[a-z]{2}_[a-z]{2})\//i, '/')
    .replace(/\/+$/, '');
const moved = results.filter(
  (r) =>
    r.status >= 200 && r.status < 300 && r.finalUrl && canonical(r.finalUrl) !== canonical(r.url),
);

const gone = results.filter((r) => r.status === 404 || r.status === 410);
const unreachable = results.filter((r) => r.status === 0);
const other = results.filter((r) => r.status >= 400 && r.status !== 404 && r.status !== 410);

for (const r of gone) {
  console.error(`  GONE  ${r.status}  ${r.url}`);
  console.error(`        cited by: ${citedBy.get(r.url).join(', ')}`);
}
for (const r of moved) {
  console.warn(`  moved ${r.url}`);
  console.warn(`     -> ${r.finalUrl}`);
  console.warn(`        cited by: ${citedBy.get(r.url).join(', ')}`);
}
for (const r of other) {
  console.warn(`  warn  ${r.status}  ${r.url}`);
}
for (const r of unreachable) {
  console.warn(`  warn  unreachable (${r.error})  ${r.url}`);
}

console.log(
  `${results.length - gone.length - other.length - unreachable.length} ok, ` +
    `${gone.length} gone, ${moved.length} moved, ${other.length} other 4xx/5xx, ` +
    `${unreachable.length} unreachable`,
);

// Only a definite 404/410 is a defect. Everything else is noise from AWS's
// edge, and failing on it would train people to ignore this job.
process.exit(gone.length > 0 ? 1 : 0);
