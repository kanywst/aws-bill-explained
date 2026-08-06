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
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
const services = (
  await Promise.all(files.map(async (f) => JSON.parse(await readFile(DIR + f, 'utf8'))))
).flat();

/** One check per distinct URL, remembering who cited it. */
const citedBy = new Map();
for (const service of services) {
  for (const url of service.sources ?? []) {
    citedBy.set(url, [...(citedBy.get(url) ?? []), service.slug]);
  }
}

const urls = [...citedBy.keys()].sort();
console.log(`checking ${urls.length} distinct sources across ${services.length} services`);

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
    return { url, status: res.status };
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

const gone = results.filter((r) => r.status === 404 || r.status === 410);
const unreachable = results.filter((r) => r.status === 0);
const other = results.filter((r) => r.status >= 400 && r.status !== 404 && r.status !== 410);

for (const r of gone) {
  console.error(`  GONE  ${r.status}  ${r.url}`);
  console.error(`        cited by: ${citedBy.get(r.url).join(', ')}`);
}
for (const r of other) {
  console.warn(`  warn  ${r.status}  ${r.url}`);
}
for (const r of unreachable) {
  console.warn(`  warn  unreachable (${r.error})  ${r.url}`);
}

console.log(
  `${results.length - gone.length - other.length - unreachable.length} ok, ` +
    `${gone.length} gone, ${other.length} other 4xx/5xx, ${unreachable.length} unreachable`,
);

// Only a definite 404/410 is a defect. Everything else is noise from AWS's
// edge, and failing on it would train people to ignore this job.
process.exit(gone.length > 0 ? 1 : 0);
