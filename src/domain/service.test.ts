import { describe, expect, it } from 'vitest';
import { MeterSet } from './meter';
import { Service, isCategoryId, normaliseSlug } from './service';

const build = (over: Partial<ConstructorParameters<typeof Service>[0]> = {}) =>
  new Service({
    slug: 'ec2',
    name: 'Amazon EC2',
    category: 'compute',
    meters: MeterSet.of(['time', 'bytes']),
    oneLiner: 'Instance-seconds and bytes out.',
    trap: 'EBS keeps billing after you stop.',
    billOn: ['BoxUsage'],
    confidence: 'high',
    sources: ['https://aws.amazon.com/ec2/pricing/'],
    checked: '2026-08-04',
    ...over,
  });

describe('normaliseSlug', () => {
  it('strips the vendor prefix so independent research passes agree on identity', () => {
    expect(normaliseSlug('amazon-s3')).toBe('s3');
    expect(normaliseSlug('aws-lambda')).toBe('lambda');
    expect(normaliseSlug('s3')).toBe('s3');
  });

  it('keeps a prefix that is the entire name, so nothing becomes empty', () => {
    expect(normaliseSlug('aws')).toBe('aws');
    expect(normaliseSlug('amazon')).toBe('amazon');
  });

  it('collapses punctuation and case', () => {
    expect(normaliseSlug('Amazon EC2 Auto Scaling')).toBe('ec2-auto-scaling');
    expect(normaliseSlug('  API_Gateway  ')).toBe('api-gateway');
  });

  it('never leaves leading or trailing separators', () => {
    expect(normaliseSlug('--s3--')).toBe('s3');
    expect(normaliseSlug('(NAT) Gateway!')).toBe('nat-gateway');
  });

  it('is idempotent', () => {
    for (const raw of ['amazon-s3', 'AWS Step Functions', '  ec2 ']) {
      expect(normaliseSlug(normaliseSlug(raw))).toBe(normaliseSlug(raw));
    }
  });
});

describe('isCategoryId', () => {
  it('rejects categories the site has no page for', () => {
    expect(isCategoryId('compute')).toBe(true);
    expect(isCategoryId('quantum')).toBe(false);
    expect(isCategoryId(null)).toBe(false);
  });
});

describe('Service', () => {
  it('is identified by slug alone', () => {
    expect(build().equals(build({ name: 'Totally different' }))).toBe(true);
    expect(build().equals(build({ slug: 'lambda' }))).toBe(false);
  });

  it('reports free only when it turns no meters', () => {
    expect(build({ meters: MeterSet.none() }).isFree).toBe(true);
    expect(build().isFree).toBe(false);
  });

  it('answers which meters it turns', () => {
    const service = build();
    expect(service.turns('time')).toBe(true);
    expect(service.turns('calls')).toBe(false);
  });

  it('knows when it has no source behind its claims', () => {
    expect(build().isSourced).toBe(true);
    expect(build({ sources: [] }).isSourced).toBe(false);
  });

  describe('ageInDays', () => {
    it('measures staleness against a supplied date', () => {
      const service = build({ checked: '2026-08-04' });
      expect(service.ageInDays(new Date('2026-08-04T00:00:00Z'))).toBe(0);
      expect(service.ageInDays(new Date('2026-09-03T00:00:00Z'))).toBe(30);
    });

    it('treats a missing or unparseable date as infinitely stale', () => {
      expect(build({ checked: '' }).ageInDays(new Date('2026-08-04'))).toBe(Infinity);
      expect(build({ checked: 'someday' }).ageInDays(new Date('2026-08-04'))).toBe(Infinity);
    });
  });
});
