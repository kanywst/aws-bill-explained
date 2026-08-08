/**
 * Wait until the deployed site is serving the build we just made.
 *
 * A deploy is not atomic from the outside. For a short window after wrangler
 * returns, Cloudflare can still answer with the previous build's fingerprinted
 * CSS — which is how the post-deploy accessibility check failed once and passed
 * on retry: it measured a colour from the stylesheet before the fix.
 *
 * Sleeping for a guessed number of seconds trades one wrong answer for another.
 * Astro fingerprints its assets, so the build states its own identity: poll
 * until the deployed HTML references the same stylesheet the local build does.
 *
 *   node scripts/await-deploy.mjs <url> [timeoutSeconds]
 */
import { readFile } from 'node:fs/promises';

const [, , target, seconds = '120'] = process.argv;
if (!target) {
  console.error('usage: node scripts/await-deploy.mjs <url> [timeoutSeconds]');
  process.exit(2);
}

const local = await readFile(new URL('../dist/index.html', import.meta.url).pathname, 'utf8');
const expected = local.match(/\/_astro\/[\w.-]+\.css/)?.[0];
if (!expected) {
  console.error('  no fingerprinted stylesheet in the local build — nothing to wait for');
  process.exit(1);
}

const deadline = Date.now() + Number(seconds) * 1000;
let attempt = 0;

while (Date.now() < deadline) {
  attempt += 1;
  try {
    const res = await fetch(`${target}?cachebust=${attempt}`, { cache: 'no-store' });
    const html = await res.text();
    if (html.includes(expected)) {
      console.log(`  deployed build is live after ${attempt} check(s): ${expected}`);
      process.exit(0);
    }
    const serving = html.match(/\/_astro\/[\w.-]+\.css/)?.[0] ?? 'nothing recognisable';
    console.log(`  still serving ${serving}, waiting for ${expected}`);
  } catch (error) {
    console.log(`  ${String(error?.message ?? error)}`);
  }
  await new Promise((r) => setTimeout(r, 5_000));
}

console.error(`  ${target} never served ${expected} within ${seconds}s`);
process.exit(1);
