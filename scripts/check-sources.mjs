/**
 * Check that every cited AWS source still resolves.
 *
 * The site's whole claim is that each classification is backed by a primary
 * AWS page. A citation that has died is not a broken-link nit, it is a claim
 * with nothing behind it, and AWS retires pages often enough that this has
 * already happened once in this dataset.
 *
 * The subtlety this script exists for: AWS documentation mostly does NOT 404.
 * A retired page 200s, having redirected to its guide's index. So a status
 * check alone passes citations that are gone, and only comparing the final URL
 * against the requested one finds them.
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
 * ever saw.
 *
 * The frontmatter is read without a YAML dependency, so the scanner has to
 * handle both shapes that appear in these files: a block sequence under
 * `sources:` and the flow style (`meters: ['units']`) the other keys use. A
 * scanner that quietly reads zero from a shape it does not know is worse than
 * no scanner, so an unparseable `sources:` key is a hard failure below.
 */
const unreadable = [];
let topicCount = 0;

for (const lang of await readdir(TOPICS)) {
  let entries;
  try {
    entries = (await readdir(TOPICS + lang)).filter((f) => f.endsWith('.mdx'));
  } catch {
    // A stray file rather than a locale directory is not a dead citation.
    continue;
  }
  for (const file of entries) {
    const id = `${lang}/${file.replace(/\.mdx$/, '')}`;
    const body = await readFile(`${TOPICS}${lang}/${file}`, 'utf8');
    // Anchored to the opening fence, so a `---` inside a frontmatter value
    // cannot truncate the block and silently drop every URL after it.
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (!/^sources:/m.test(frontmatter)) continue;

    const urls = [];
    let inBlock = false;
    for (const line of frontmatter.split('\n')) {
      const key = line.match(/^sources:(.*)$/);
      if (key) {
        // Flow style on the same line: sources: ['https://a', 'https://b']
        urls.push(...(key[1].match(/https:\/\/[^\s'",\]]+/g) ?? []));
        inBlock = key[1].trim() === '';
        continue;
      }
      if (!inBlock) continue;
      const item = line.match(/^\s+-\s*['"]?(https:\/\/[^\s'"]+)/);
      if (item) urls.push(item[1]);
      else if (/^\S/.test(line)) inBlock = false;
    }

    if (urls.length === 0) unreadable.push(id);
    else topicCount += 1;
    for (const url of urls) cite(url, id);
  }
}

const urls = [...citedBy.keys()].sort();
console.log(
  `checking ${urls.length} distinct sources across ${services.length} services and ${topicCount} articles`,
);

async function once(url, method, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: extraHeaders,
      signal: controller.signal,
    });
    // Undici holds the socket until the body is read or collected.
    await res.body?.cancel();
    return { url, status: res.status, finalUrl: res.url };
  } catch (error) {
    return { url, status: 0, error: String(error?.name ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(url) {
  // HEAD first; some AWS pages reject it, so fall back to a ranged GET rather
  // than downloading the whole document. Each attempt gets its own deadline,
  // otherwise a slow HEAD leaves the fallback no time and a live page is
  // reported unreachable.
  let res = await once(url, 'HEAD');
  if (res.status === 405 || res.status === 403) {
    res = await once(url, 'GET', { Range: 'bytes=0-1024' });
  }
  // A 404 is the only thing that fails this job, so never take one bare HEAD's
  // word for it. Bot mitigation and a cold edge both produce one-off 404s, and
  // there is nothing else between a single bad response and a red main.
  if (res.status === 404 || res.status === 410) {
    await new Promise((r) => setTimeout(r, 1_000));
    res = await once(url, 'GET', { Range: 'bytes=0-1024' });
  }
  return res;
}

// A worker pool rather than batched Promise.all: with a barrier per batch, one
// hanging URL stalls its whole batch, and 65 batches x 15s exceeds the job's
// timeout. Here a slow URL occupies one worker and the rest keep going.
const results = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      results.push(await probe(url));
    }
  }),
);

/**
 * Ignore the cosmetic differences: trailing slash, tracking query, and the
 * locale segment AWS injects from Accept-Language (`/jp/`, `/de/`, `/en_us/`)
 *, so this reports real relocations rather than every redirect. Anchored to
 * the host so a path segment that merely looks like a locale survives.
 */
const TRACKING = /^(icmpid|trk|sc_channel|sc_campaign|sc_geo|sc_country|sc_outcome|ref_|did)$/i;
const canonical = (u) => {
  const url = new URL(u);
  // Drop only the tracking parameters. Discarding the whole query would hide a
  // relocation that strips a parameter the page needs to select the right view.
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  url.hash = '';
  return `${url.origin}${url.pathname}${url.search}`
    .replace(/^(https:\/\/[^/]+)\/[a-z]{2}(?:_[a-z]{2})?\//i, '$1/')
    .replace(/\/+$/, '');
};

const gone = results.filter((r) => r.status === 404 || r.status === 410);
const unreachable = results.filter((r) => r.status === 0);
const other = results.filter((r) => r.status >= 400 && r.status !== 404 && r.status !== 410);
const moved = results.filter(
  (r) =>
    r.status >= 200 && r.status < 300 && r.finalUrl && canonical(r.finalUrl) !== canonical(r.url),
);

/**
 * The soft-404: the page redirected UP to an ancestor, which is how AWS says
 * "this no longer exists". A sideways move, a page that genuinely relocated:
 * still resolves to real content, so it only warns.
 */
const softGone = moved.filter((r) => canonical(r.url).startsWith(canonical(r.finalUrl) + '/'));
const relocated = moved.filter((r) => !softGone.includes(r));

for (const r of gone) {
  console.error(`  GONE  ${r.status}  ${r.url}`);
  console.error(`        cited by: ${citedBy.get(r.url).join(', ')}`);
}
for (const r of softGone) {
  console.error(`  GONE  redirected to its index, so the page is retired`);
  console.error(`        ${r.url}`);
  console.error(`        -> ${r.finalUrl}`);
  console.error(`        cited by: ${citedBy.get(r.url).join(', ')}`);
}
for (const r of relocated) {
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
for (const id of unreadable) {
  console.error(`  FAIL  ${id}: has a sources key this scanner could not read`);
}

const ok =
  results.length -
  gone.length -
  softGone.length -
  relocated.length -
  other.length -
  unreachable.length;
console.log(
  `${ok} ok, ${gone.length + softGone.length} gone, ${relocated.length} moved, ` +
    `${other.length} other 4xx/5xx, ${unreachable.length} unreachable`,
);

// A dead citation fails. Timeouts, 403s and sideways redirects only warn.
// failing on those would train people to ignore this job.
process.exit(gone.length + softGone.length + unreadable.length > 0 ? 1 : 0);
