/**
 * Layout regressions that break nothing a browser complains about.
 *
 * A page can lose its grid, drop an element behind another, or push the thing
 * it is arguing for below the fold, and still load with no console error, no
 * failed request and no horizontal overflow. The smoke tests would pass.
 *
 * These assert geometry rather than pixels. Screenshot baselines are the usual
 * answer, but they are captured on one platform and compared on another — the
 * fonts on a macOS laptop and an Ubuntu runner do not rasterise identically, so
 * the baseline is either wrong locally or wrong in CI. A suite that fails for
 * reasons unrelated to the change teaches people to stop reading it, which is
 * the failure mode this repository has already been through once today. Element
 * boxes are the same everywhere, so that is what gets checked.
 */
import { expect, test, type Page } from '@playwright/test';

/** The rectangle a browser actually laid the element out in. */
async function box(page: Page, selector: string, index = 0) {
  const rect = await page.locator(selector).nth(index).boundingBox();
  expect(rect, `${selector}[${index}] has no box — it is not laid out at all`).not.toBeNull();
  return rect!;
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the three meters sit side by side, not stacked', async ({ page }) => {
    await page.goto('/');

    const cards = page.locator('.meter-card');
    await expect(cards).toHaveCount(3);

    const boxes = await Promise.all([0, 1, 2].map((i) => box(page, '.meter-card', i)));

    // Side by side means each starts to the right of the last and they share a
    // row. A collapsed grid puts them on top of each other, which reads as three
    // unrelated sections rather than one comparison.
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i]!.x, `card ${i} is not right of card ${i - 1}`).toBeGreaterThan(
        boxes[i - 1]!.x,
      );
      expect(Math.abs(boxes[i]!.y - boxes[0]!.y), `card ${i} is on another row`).toBeLessThan(4);
    }

    // Equal-width columns: the widest must not be more than a little wider than
    // the narrowest, or one meter is being presented as the important one.
    const widths = boxes.map((b) => b.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(8);
  });

  test('the counter is visible without scrolling', async ({ page }) => {
    await page.goto('/');

    // The argument the whole page rests on is a meter turning while you read.
    // Below the fold it does not make it.
    const dials = await box(page, '.rig-dials');
    expect(dials.y + dials.height, 'the dials start below the fold').toBeLessThan(900);
  });
});

test.describe('narrow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the three meters stack instead of squeezing', async ({ page }) => {
    await page.goto('/');

    const boxes = await Promise.all([0, 1, 2].map((i) => box(page, '.meter-card', i)));

    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i]!.y, `card ${i} did not move below card ${i - 1}`).toBeGreaterThan(
        boxes[i - 1]!.y,
      );
    }
    // And each one still gets most of the screen rather than a squeezed column.
    for (const b of boxes) expect(b.width).toBeGreaterThan(260);
  });

  test('a diagram scrolls inside its own region, not the page', async ({ page }) => {
    await page.goto('/topics/boundaries/');

    const scroller = page.locator('.bm-scroll').first();
    await expect(scroller).toBeAttached();

    const { scrolls, wider } = await scroller.evaluate((el) => ({
      scrolls: el.scrollWidth > el.clientWidth,
      wider: el.getBoundingClientRect().width <= document.documentElement.clientWidth + 1,
    }));

    // The diagram is wider than the phone; that is expected. What matters is
    // that the overflow belongs to the diagram and the container stays within
    // the screen, so the prose around it is unaffected.
    expect(scrolls, 'the diagram is not actually overflowing — check the fixture').toBe(true);
    expect(wider, 'the scroll region itself is wider than the screen').toBe(true);
  });
});
