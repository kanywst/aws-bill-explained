import { describe, expect, it } from 'vitest';
import { MeterSet } from './meter';
import { ServiceSlug } from './service-slug';
import {
  InvalidServiceError,
  MAX_ONE_LINER,
  MAX_TRAP,
  Service,
  isCategoryId,
  type ServiceProps,
} from './service';

const build = (over: Partial<ServiceProps> = {}) =>
  new Service({
    slug: ServiceSlug.of('ec2'),
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

describe('isCategoryId', () => {
  it('rejects categories the site has no page for', () => {
    expect(isCategoryId('compute')).toBe(true);
    expect(isCategoryId('quantum')).toBe(false);
    expect(isCategoryId(null)).toBe(false);
  });
});

/**
 * These are the tests that change the answer to "is this really DDD?". The
 * editorial limits used to be asserted against the committed dataset, which
 * meant a bad record had to be written and shipped before anything noticed.
 * Now the model refuses to hold one.
 */
describe('Service invariants', () => {
  it('refuses an empty name, one-liner or trap', () => {
    expect(() => build({ name: '  ' })).toThrow(/name is empty/);
    expect(() => build({ oneLiner: '' })).toThrow(/oneLiner is empty/);
    expect(() => build({ trap: '   ' })).toThrow(/trap is empty/);
  });

  it('refuses prose longer than a reader can hold', () => {
    expect(() => build({ oneLiner: 'x'.repeat(MAX_ONE_LINER + 1) })).toThrow(InvalidServiceError);
    expect(() => build({ trap: 'x'.repeat(MAX_TRAP + 1) })).toThrow(InvalidServiceError);
    // Exactly at the limit is fine; the boundary is inclusive.
    expect(() => build({ oneLiner: 'x'.repeat(MAX_ONE_LINER) })).not.toThrow();
    expect(() => build({ trap: 'x'.repeat(MAX_TRAP) })).not.toThrow();
  });

  it('refuses a dollar rate in the prose, because rates go stale and meters do not', () => {
    expect(() => build({ oneLiner: 'Costs $0.09 per GB.' })).toThrow(/oneLiner quotes a dollar/);
    expect(() => build({ trap: 'About $0.045/GB in most regions.' })).toThrow(
      /trap quotes a dollar/,
    );
    // A bare dollar sign with no figure after it is not a rate.
    expect(() => build({ trap: 'Priced in USD, not in dollars per request.' })).not.toThrow();
  });

  it('refuses a missing or malformed checked date', () => {
    expect(() => build({ checked: '' })).toThrow(/not an ISO date/);
    expect(() => build({ checked: 'someday' })).toThrow(/not an ISO date/);
    expect(() => build({ checked: '04-08-2026' })).toThrow(/not an ISO date/);
    expect(() => build({ checked: '2026-13-45' })).toThrow(/not an ISO date/);
  });

  it('names the offending service in the error, so a build failure is actionable', () => {
    expect(() => build({ slug: ServiceSlug.of('lambda'), oneLiner: '' })).toThrow(
      /Service "lambda"/,
    );
  });
});

describe('Service', () => {
  it('is identified by slug alone', () => {
    expect(build().equals(build({ name: 'Totally different' }))).toBe(true);
    expect(build().equals(build({ slug: ServiceSlug.of('lambda') }))).toBe(false);
  });

  it('reports free only when it turns no meters', () => {
    expect(build({ meters: MeterSet.none() }).isFree).toBe(true);
    expect(build().isFree).toBe(false);
  });

  it('answers which meters it turns', () => {
    const service = build();
    expect(service.turns('time')).toBe(true);
    expect(service.turns('units')).toBe(false);
  });

  it('cannot be built without an AWS source behind its claims', () => {
    expect(build().isSourced).toBe(true);
    expect(() => build({ sources: [] })).toThrow(/has no source/);
    expect(() => build({ sources: ['https://blog.example/aws-costs'] })).toThrow(
      /not an AWS-controlled page/,
    );
  });

  it('separates "turns no meters" from "we could not read the meters"', () => {
    expect(build({ meters: MeterSet.none() }).isFree).toBe(true);
    expect(build({ meters: MeterSet.none(), unclassified: true }).isFree).toBe(false);
    expect(build({ meters: MeterSet.none(), unclassified: true }).isUnclassified).toBe(true);
  });

  describe('ageInDays', () => {
    it('measures staleness against a supplied date', () => {
      const service = build({ checked: '2026-08-04' });
      expect(service.ageInDays(new Date('2026-08-04T00:00:00Z'))).toBe(0);
      expect(service.ageInDays(new Date('2026-09-03T00:00:00Z'))).toBe(30);
    });
  });
});
