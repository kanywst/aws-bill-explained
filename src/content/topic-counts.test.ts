/**
 * The topics quote catalogue counts in prose. Prose does not recompile when a
 * service is added, so those numbers drift silently and the site starts
 * asserting a total it no longer has — which is exactly the failure the dated
 * `checked` field exists to prevent everywhere else.
 *
 * This pins every count that appears in a topic to the catalogue that produced
 * it. Adding a service now fails here with the new number to paste in, rather
 * than shipping a stale one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../infrastructure/service-repository';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const catalogue = loadCatalogue();
const total = catalogue.size;
const withUnits = catalogue.turning('units').length;
const withoutUnits = total - withUnits;

describe('counts quoted in topic prose', () => {
  it('matches the catalogue in the Japanese units topic', () => {
    const text = read('./topics/ja/units.mdx');
    expect(text).toContain(
      `このサイトが索引している ${total} サービスのうち、個数メーターを持つのは ${withUnits}、持たないのが ${withoutUnits}。`,
    );
  });

  it('matches the catalogue in the English units topic', () => {
    const text = read('./topics/en/units.mdx');
    expect(text).toContain(
      `Of the ${total} services indexed on this site, ${withUnits} turn a Units meter and ${withoutUnits} never do.`,
    );
  });

  /**
   * "Roughly half" is the claim the paragraph is built on. If the catalogue
   * ever drifts far from that, the sentence needs rewriting and not just a
   * new number.
   */
  it('keeps the Units split close enough to half for the prose to hold', () => {
    expect(withUnits / total).toBeGreaterThan(0.4);
    expect(withUnits / total).toBeLessThan(0.6);
  });
});
