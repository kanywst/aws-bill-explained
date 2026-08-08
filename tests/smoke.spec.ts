/**
 * Does the site actually work in a browser?
 *
 * Every other check in this repo answers a different question. The type check
 * says the code compiles, vitest says the arithmetic is right, check-build says
 * the HTML has no negative SVG geometry, check-sources says the citations
 * resolve. All of them passed for days while the home page's live cost counter
 * sat at 00:00:00 and the services filter did nothing, because a
 * `script-src 'self'` policy blocked the inline scripts Astro emits. None of
 * those checks opens a page, so none of them could see it.
 *
 * These tests open pages, with the production headers applied. They assert the
 * two things a reader would notice first and the one thing that hides: a
 * console error.
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/** Collects console errors and failed requests for the life of a page. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  return problems;
}

const HOMES = [
  { lang: 'en', path: '/' },
  { lang: 'ja', path: '/ja/' },
];

for (const { lang, path } of HOMES) {
  test(`${lang} home: the cost counter runs`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(path);

    const dial = page.locator('#dial-time');
    await expect(dial).toHaveCount(1);

    // The counter is the site's thesis in one element: a meter that turns while
    // you do nothing. If it is frozen the page argues the opposite of the copy.
    const first = await dial.getAttribute('data-value');
    await page.waitForTimeout(2500);
    const second = await dial.getAttribute('data-value');
    expect(second, `time dial stuck at ${first}`).not.toBe(first);

    const cost = page.locator('#dial-cost');
    expect(await cost.getAttribute('data-value')).not.toBe('0.000000');

    expect(problems).toEqual([]);
  });
}

const INDEXES = [
  { lang: 'en', path: '/services/', free: 'Free' },
  { lang: 'ja', path: '/ja/services/', free: '無料' },
];

for (const { lang, path, free } of INDEXES) {
  test(`${lang} services: the meter filter narrows the list`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(path);

    const cards = page.locator('.si-item');
    const total = await cards.count();
    expect(total).toBeGreaterThan(100);

    await page.getByRole('button', { name: free, exact: false }).first().click();
    await expect
      .poll(async () => await cards.locator(':visible').count(), { timeout: 5_000 })
      .toBeLessThan(total);

    // The filter is announced, not just applied — the count is the only feedback
    // a screen reader gets that anything happened.
    await expect(page.locator('[role="status"]')).not.toBeEmpty();

    expect(problems).toEqual([]);
  });
}

test('a topic page renders its diagrams and loads clean', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/topics/idle/');

  // Diagrams are aria-hidden and carry a text alternative beside them; both
  // halves have to be present or the argument is missing for someone.
  await expect(page.locator('svg[aria-hidden="true"]').first()).toBeAttached();
  await expect(page.locator('.sr').first()).toBeAttached();

  expect(problems).toEqual([]);
});
