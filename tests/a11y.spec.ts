/**
 * Automated accessibility scan.
 *
 * This site has shipped three separate accessibility defects: colour as the
 * only channel for billed-versus-free, role="img" pruning every diagram's
 * contents from the accessibility tree, and a boundary list announced in the
 * opposite order from the argument it was describing. All three were caught by
 * a human reading the code. None was caught by a tool, because there was no
 * tool. This is the tool.
 *
 * It cannot see the third kind, axe has no opinion about whether a correct
 * sentence says the right thing, but it does catch contrast, missing names
 * and broken structure, which is the class that is cheapest to introduce.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  { name: 'home (en)', path: '/' },
  { name: 'home (ja)', path: '/ja/' },
  { name: 'services index', path: '/services/' },
  { name: 'service page', path: '/services/ec2/' },
  { name: 'topic with all three diagrams', path: '/topics/boundaries/' },
  { name: 'topics index', path: '/topics/' },
];

for (const { name, path } of PAGES) {
  test(`${name} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = serious.map(
      (v) => `${v.id} (${v.impact}) on ${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`,
    );

    expect(summary, `${path}\n${summary.join('\n')}`).toEqual([]);
  });
}
