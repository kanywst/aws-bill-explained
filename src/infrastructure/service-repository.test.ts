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
  };

  it('normalises the slug at the boundary', () => {
    expect(toService(valid).slug).toBe('s3');
  });

  it('rejects records that cannot be identified or routed', () => {
    expect(() => toService(null)).toThrow(InvalidServiceRecordError);
    expect(() => toService({ ...valid, slug: '' })).toThrow(/no slug/);
    expect(() => toService({ ...valid, name: '' })).toThrow(/no name/);
    expect(() => toService({ ...valid, category: 'wat' })).toThrow(/unknown category/);
  });

  it('tolerates missing optional prose rather than failing a build over it', () => {
    const s = toService({ slug: 'x', name: 'X', category: 'compute' });
    expect(s.oneLiner).toBe('');
    expect(s.billOn).toEqual([]);
    expect(s.meters.isFree).toBe(true);
  });

  it('treats any confidence other than "high" as medium', () => {
    expect(toService({ ...valid, confidence: 'high' }).confidence).toBe('high');
    expect(toService({ ...valid, confidence: 'wildly-unsure' }).confidence).toBe('medium');
    expect(toService({ ...valid, confidence: undefined }).confidence).toBe('medium');
  });

  it('filters non-string entries out of string arrays', () => {
    const s = toService({ ...valid, billOn: ['ok', 42, null], sources: [{}, 'https://a'] });
    expect(s.billOn).toEqual(['ok']);
    expect(s.sources).toEqual(['https://a']);
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
    const slugs = catalogue.all().map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses only slugs that are safe in a URL path', () => {
    for (const service of catalogue.all()) {
      expect(service.slug, `slug "${service.slug}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('covers every declared category', () => {
    expect(catalogue.categories()).toEqual([...CATEGORY_IDS]);
  });

  it('never publishes a claim without a source', () => {
    expect(catalogue.unsourced().map((s) => s.slug)).toEqual([]);
  });

  it('cites only AWS-controlled sources', () => {
    const allowed =
      /^https:\/\/(aws\.amazon\.com|docs\.aws\.amazon\.com|repost\.aws|pricing\.[a-z0-9-]+\.amazonaws\.com)\//;
    for (const service of catalogue.all()) {
      for (const source of service.sources) {
        expect(source, `${service.slug} cites ${source}`).toMatch(allowed);
      }
    }
  });

  it('gives every service a one-liner and a trap short enough to read', () => {
    for (const service of catalogue.all()) {
      expect(service.oneLiner.length, `${service.slug} oneLiner`).toBeGreaterThan(0);
      expect(service.oneLiner.length, `${service.slug} oneLiner`).toBeLessThanOrEqual(120);
      expect(service.trap.length, `${service.slug} trap`).toBeGreaterThan(0);
      expect(service.trap.length, `${service.slug} trap`).toBeLessThanOrEqual(220);
    }
  });

  it('quotes no dollar rates, because rates go stale and meters do not', () => {
    for (const service of catalogue.all()) {
      const prose = `${service.oneLiner} ${service.trap}`;
      expect(prose, `${service.slug} quotes a rate`).not.toMatch(/\$\d/);
    }
  });

  it('keeps the services we know are free actually free', () => {
    // CloudFormation is deliberately absent: third-party extensions and Hooks
    // bill per handler operation, so "CloudFormation is free" is only true of
    // AWS:: and Alexa:: resource types.
    for (const slug of ['iam', 'sts', 'organizations', 'vpc', 'ram']) {
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
      expect(service.checked, `${service.slug} has no checked date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        Number.isNaN(Date.parse(service.checked)),
        `${service.slug} checked date is unparseable`,
      ).toBe(false);
    }
  });

  it('reports how much of the catalogue is still low confidence', () => {
    const ratio = catalogue.lowConfidence().length / catalogue.size;
    expect(ratio, 'too much of the catalogue is unverified').toBeLessThan(0.3);
  });
});
