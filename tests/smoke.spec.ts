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
import { readdirSync } from 'node:fs';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Collects console errors, uncaught exceptions and genuinely broken requests.
 *
 * Fonts are excluded from the request check on purpose. The webfont is split by
 * unicode-range, and WebKit starts then cancels the subsets it decides it does
 * not need; Playwright reports a cancellation as a failed request, so counting
 * those made the suite fail at random on a font that was present and served.
 * A font that is actually missing returns 404, which is a response rather than
 * a failure, so the response check below is what would catch it, and catches
 * a broken stylesheet or script too.
 */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (r.resourceType() === 'font') return;
    problems.push(`request failed (${r.failure()?.errorText}): ${r.url()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
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

    // The filter is announced, not just applied: the count is the only feedback
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

/**
 * The defect axe cannot see, pinned by hand.
 *
 * BoundaryMap receives its rings outermost-first, because that is the order the
 * boxes have to be drawn in. The sentence above the list says "from the inside
 * out" and the diagram's argument is that the centre is free and every ring you
 * cross outward is a toll. Announcing them in prop order told a screen reader
 * the innermost boundary was the internet at nine cents a gigabyte: the thesis
 * inverted, for exactly the readers who cannot see the picture that contradicts
 * it. Every sentence was correct; only the order was wrong, which is why no
 * automated audit flagged it and why this test exists.
 */
test('the boundary diagram is announced from the free centre outwards', async ({ page }) => {
  await page.goto('/topics/boundaries/');

  // textContent, not innerText: .sr is clipped to a pixel, and WebKit returns
  // nothing from innerText for text it does not render. The whole point of
  // this markup is that it is read while not being drawn.
  const items = await page.locator('ol.sr').first().locator('li').allTextContents();
  expect(items.length).toBeGreaterThan(2);

  const free = items.findIndex((t) => /free/i.test(t));
  expect(free, 'no ring is described as free').toBeGreaterThanOrEqual(0);
  expect(free, 'the free ring must be announced first, as the centre').toBe(0);

  // And the internet (the most expensive crossing) must be announced last.
  expect(items.at(-1), 'the outermost ring should be the internet').toMatch(/internet/i);
});

/**
 * Read from disk rather than listed by hand. The hand-written version claimed
 * to cover "every topic" while four newer ones were missing from it, the list
 * drifted the first time articles were added after it was written.
 */
const TOPICS = readdirSync(new URL('../src/content/topics/en/', import.meta.url))
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''));

test('every topic loads in both languages without an error', async ({ page }) => {
  const problems = watch(page);
  for (const slug of TOPICS) {
    for (const prefix of ['', '/ja']) {
      const response = await page.goto(`${prefix}/topics/${slug}/`);
      expect(response?.status(), `${prefix}/topics/${slug}/`).toBe(200);
      await expect(page.locator('h1')).not.toBeEmpty();
    }
  }
  expect(problems).toEqual([]);
});

test.describe('reduced motion', () => {
  test('the counter states the total instead of animating', async ({ page }) => {
    const problems = watch(page);
    // Set at runtime rather than through test.use: the fixture form did not
    // reach matchMedia here, and a preference test that silently tests the
    // default is worse than none.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // A number flickering ten times a second in peripheral vision is what this
    // preference asks us not to do. The argument survives as one reading, a
    // whole day of an instance nobody is using, so the value must be present
    // and must be still.
    const dial = page.locator('#dial-time');
    await expect(dial).toHaveAttribute('data-value', '24:00:00');

    const cost = await page.locator('#dial-cost').getAttribute('data-value');
    expect(cost).not.toBe('0.000000');

    await page.waitForTimeout(1500);
    await expect(dial).toHaveAttribute('data-value', '24:00:00');
    expect(await page.locator('#dial-cost').getAttribute('data-value')).toBe(cost);

    expect(problems).toEqual([]);
  });
});

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/services/', '/topics/boundaries/']) {
    test(`${path} does not overflow sideways`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(path);

      // Diagrams are wider than a phone and live in their own scroll regions.
      // If one escapes, the whole document scrolls sideways and every line of
      // prose goes off-screen with it.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);

      expect(problems).toEqual([]);
    });
  }
});
