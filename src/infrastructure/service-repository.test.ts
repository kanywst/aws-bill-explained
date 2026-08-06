import { describe, expect, it } from 'vitest';
import { InvalidServiceRecordError, loadCatalogue, toService } from './service-repository';
import { CATEGORY_IDS } from '../domain/service';

describe('toService', () => {
  const valid = {
    slug: 'amazon-s3',
    name: 'Amazon S3',
    category: 'storage',
    meters: ['time', 'bytes', 'calls'],
    oneLiner: 'x',
    trap: 'y',
    billOn: ['Requests-Tier1'],
    confidence: 'high',
    sources: ['https://aws.amazon.com/s3/pricing/'],
    checked: '2026-08-04',
  };

  it('normalises the slug at the boundary', () => {
    expect(toService(valid).slug.value).toBe('s3');
  });

  it('rejects records that cannot be identified or routed', () => {
    expect(() => toService(null)).toThrow(InvalidServiceRecordError);
    expect(() => toService({ ...valid, slug: '' })).toThrow(/no usable slug/);
    expect(() => toService({ ...valid, name: '' })).toThrow(/no name/);
    expect(() => toService({ ...valid, category: 'wat' })).toThrow(/unknown category/);
  });

  it('refuses a record the domain would reject, instead of building a broken Service', () => {
    // The boundary no longer papers over missing prose: the model owns that rule.
    expect(() => toService({ slug: 'x', name: 'X', category: 'compute' })).toThrow(
      /oneLiner is empty/,
    );
  });

  it('treats any confidence other than "high" as medium', () => {
    expect(toService({ ...valid, confidence: 'high' }).confidence).toBe('high');
    expect(toService({ ...valid, confidence: 'wildly-unsure' }).confidence).toBe('medium');
    expect(toService({ ...valid, confidence: undefined }).confidence).toBe('medium');
  });

  /**
   * The bug this guards: dropping every unrecognised meter left an empty set,
   * and the domain reads an empty set as "free". A new AWS billing shape
   * therefore degraded not to "we don't know" but to a confident, unsourced
   * claim that a service costs nothing.
   */
  it('does not call a service free just because it could not read its meters', () => {
    const unknown = toService({ ...valid, meters: ['quantum-flux'] });
    expect(unknown.isUnclassified).toBe(true);
    expect(unknown.isFree).toBe(false);

    const genuinelyFree = toService({ ...valid, meters: [] });
    expect(genuinelyFree.isUnclassified).toBe(false);
    expect(genuinelyFree.isFree).toBe(true);
  });

  it('keeps the meters it does recognise while flagging the ones it dropped', () => {
    const partial = toService({ ...valid, meters: ['time', 'quantum-flux'] });
    expect(partial.meters.toArray()).toEqual(['time']);
    expect(partial.isUnclassified).toBe(true);
    expect(partial.isFree).toBe(false);
  });

  it('translates the legacy egress spelling without flagging it as dropped', () => {
    const legacy = toService({ ...valid, meters: ['time', 'egress'] });
    expect(legacy.meters.toArray()).toEqual(['time', 'bytes']);
    expect(legacy.isUnclassified).toBe(false);
  });

  it('refuses a record with no source, since the model now owns that rule', () => {
    expect(() => toService({ ...valid, sources: [] })).toThrow(/has no source/);
    expect(() => toService({ ...valid, sources: ['https://evil.example/'] })).toThrow(
      /not an AWS-controlled page/,
    );
  });

  it('filters non-string entries out of string arrays', () => {
    const s = toService({
      ...valid,
      billOn: ['ok', 42, null],
      sources: [{}, 'https://aws.amazon.com/x/'],
    });
    expect(s.billOn).toEqual(['ok']);
    expect(s.sources).toEqual(['https://aws.amazon.com/x/']);
  });
});

/**
 * These run against the real researched dataset. They are the guard that the
 * catalogue stays publishable as it grows service by service — every rule here
 * is an editorial promise the site makes to a reader looking at their bill.
 */
describe('the real catalogue', () => {
  const catalogue = loadCatalogue();

  it('loads and is non-trivial', () => {
    expect(catalogue.size).toBeGreaterThan(100);
  });

  it('has no duplicate slugs across the eight research passes', () => {
    // Catalogue.from throws on duplicates, so reaching here proves uniqueness.
    const slugs = catalogue.all().map((s) => s.slug.value);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses only slugs that are safe in a URL path', () => {
    for (const service of catalogue.all()) {
      expect(service.slug.value, `slug "${service.slug.value}"`).toMatch(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
      );
    }
  });

  it('covers every declared category', () => {
    expect(catalogue.categories()).toEqual([...CATEGORY_IDS]);
  });

  it('never publishes a claim without a source', () => {
    expect(catalogue.unsourced().map((s) => s.slug.value)).toEqual([]);
  });

  it('cites only AWS-controlled sources', () => {
    const allowed =
      /^https:\/\/(aws\.amazon\.com|docs\.aws\.amazon\.com|repost\.aws|pricing\.[a-z0-9-]+\.amazonaws\.com)\//;
    for (const service of catalogue.all()) {
      for (const source of service.sources) {
        expect(source, `${service.slug.value} cites ${source}`).toMatch(allowed);
      }
    }
  });

  it('gives every service a one-liner and a trap short enough to read', () => {
    for (const service of catalogue.all()) {
      expect(service.oneLiner.length, `${service.slug.value} oneLiner`).toBeGreaterThan(0);
      expect(service.oneLiner.length, `${service.slug.value} oneLiner`).toBeLessThanOrEqual(120);
      expect(service.trap.length, `${service.slug.value} trap`).toBeGreaterThan(0);
      expect(service.trap.length, `${service.slug.value} trap`).toBeLessThanOrEqual(220);
    }
  });

  it('quotes no dollar rates, because rates go stale and meters do not', () => {
    for (const service of catalogue.all()) {
      const prose = `${service.oneLiner} ${service.trap}`;
      expect(prose, `${service.slug.value} quotes a rate`).not.toMatch(/\$\d/);
    }
  });

  it('keeps the services we know are free actually free', () => {
    // Deliberately absent: CloudFormation, because third-party extensions and
    // Hooks bill per handler operation; and VPC, because Encryption Controls
    // bills per hour per non-empty VPC and can be incurred without opting in.
    // Both were on this list until a verification pass showed otherwise.
    for (const slug of ['iam', 'sts', 'organizations', 'ram', 'gateway-vpc-endpoint']) {
      const service = catalogue.find(slug);
      expect(service, `${slug} missing from catalogue`).toBeDefined();
      expect(service?.isFree, `${slug} should have no meters of its own`).toBe(true);
    }
  });

  it('keeps the reference examples on the meters the site teaches', () => {
    // S3 is the site's example of a service with all three meters.
    expect(catalogue.find('s3')?.meters.toArray()).toEqual(['time', 'bytes', 'calls']);
    // EC2 is the example of "no per-call charge", which is the whole EC2 page.
    expect(catalogue.find('ec2')?.turns('calls')).toBe(false);
    expect(catalogue.find('ec2')?.turns('time')).toBe(true);
    // NAT Gateway is the example of a device that bills hourly and per GB.
    expect(catalogue.find('nat-gateway')?.meters.toArray()).toEqual(['time', 'bytes']);
  });

  it('dates every classification, because AWS reprices and a claim needs a timestamp', () => {
    for (const service of catalogue.all()) {
      expect(service.checked, `${service.slug.value} has no checked date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(
        Number.isNaN(Date.parse(service.checked)),
        `${service.slug.value} checked date is unparseable`,
      ).toBe(false);
    }
  });

  it('reports how much of the catalogue is still low confidence', () => {
    const ratio = catalogue.lowConfidence().length / catalogue.size;
    expect(ratio, 'too much of the catalogue is unverified').toBeLessThan(0.3);
  });
});
