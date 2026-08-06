import { describe, expect, it } from 'vitest';
import { MeterSet, type MeterId } from './meter';
import { Catalogue, DuplicateServiceError } from './catalogue';
import { Service, type CategoryId } from './service';
import { ServiceSlug } from './service-slug';

const svc = (
  slug: string,
  meters: MeterId[],
  over: {
    category?: CategoryId;
    name?: string;
    sources?: string[];
    confidence?: 'high' | 'medium';
  } = {},
) =>
  new Service({
    slug: ServiceSlug.of(slug),
    name: over.name ?? slug.toUpperCase(),
    category: over.category ?? 'compute',
    meters: MeterSet.of(meters),
    oneLiner: `What ${slug} charges for.`,
    trap: `What people miss about ${slug}.`,
    billOn: [],
    confidence: over.confidence ?? 'high',
    sources: over.sources ?? ['https://aws.amazon.com/'],
    checked: '2026-08-04',
  });

describe('Catalogue', () => {
  it('refuses duplicate slugs rather than silently dropping a service', () => {
    expect(() => Catalogue.from([svc('ec2', ['time']), svc('ec2', ['calls'])])).toThrow(
      DuplicateServiceError,
    );
  });

  it('is empty-safe', () => {
    const empty = Catalogue.from([]);
    expect(empty.size).toBe(0);
    expect(empty.all()).toEqual([]);
    expect(empty.categories()).toEqual([]);
    expect(empty.countByMeter()).toEqual({ time: 0, bytes: 0, calls: 0 });
  });

  it('finds by slug and returns undefined for a miss', () => {
    const c = Catalogue.from([svc('ec2', ['time'])]);
    expect(c.find('ec2')?.slug.value).toBe('ec2');
    expect(c.find('nope')).toBeUndefined();
  });

  it('orders by display name, not insertion order', () => {
    const c = Catalogue.from([
      svc('zeta', ['time'], { name: 'Zeta' }),
      svc('alpha', ['time'], { name: 'Alpha' }),
    ]);
    expect(c.all().map((s) => s.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('selects the services turning a given meter', () => {
    const c = Catalogue.from([
      svc('ec2', ['time', 'bytes']),
      svc('lambda', ['time', 'calls']),
      svc('iam', []),
    ]);
    expect(c.turning('time').map((s) => s.slug.value)).toEqual(['ec2', 'lambda']);
    expect(c.turning('calls').map((s) => s.slug.value)).toEqual(['lambda']);
  });

  it('treats free services as a first-class group', () => {
    const c = Catalogue.from([svc('iam', []), svc('sts', []), svc('ec2', ['time'])]);
    expect(
      c
        .free()
        .map((s) => s.slug.value)
        .sort(),
    ).toEqual(['iam', 'sts']);
  });

  it('picks out the services that turn all three meters', () => {
    const c = Catalogue.from([
      svc('s3', ['time', 'bytes', 'calls']),
      svc('ec2', ['time', 'bytes']),
    ]);
    expect(c.turningAll().map((s) => s.slug.value)).toEqual(['s3']);
  });

  it('reports only categories that have entries, in canonical order', () => {
    const c = Catalogue.from([
      svc('detective', ['bytes'], { category: 'security' }),
      svc('ec2', ['time'], { category: 'compute' }),
    ]);
    // compute precedes security in CATEGORY_IDS even though security was added first.
    expect(c.categories()).toEqual(['compute', 'security']);
  });

  it('counts each meter independently, not per service', () => {
    const c = Catalogue.from([
      svc('s3', ['time', 'bytes', 'calls']),
      svc('ec2', ['time', 'bytes']),
      svc('iam', []),
    ]);
    expect(c.countByMeter()).toEqual({ time: 2, bytes: 2, calls: 1 });
  });

  it('groups services that bill the same way', () => {
    const c = Catalogue.from([
      svc('ec2', ['time', 'bytes']),
      svc('lightsail', ['bytes', 'time']),
      svc('iam', []),
    ]);
    const shapes = c.byBillingShape();
    expect(shapes.get('time+bytes')?.map((s) => s.slug.value)).toEqual(['ec2', 'lightsail']);
    expect(shapes.get('free')?.map((s) => s.slug.value)).toEqual(['iam']);
  });

  describe('editorial guards', () => {
    it('surfaces services with no source behind their claims', () => {
      const c = Catalogue.from([svc('ec2', ['time']), svc('mystery', ['time'], { sources: [] })]);
      expect(c.unsourced().map((s) => s.slug.value)).toEqual(['mystery']);
    });

    it('surfaces services we are not confident about', () => {
      const c = Catalogue.from([
        svc('ec2', ['time']),
        svc('fsx', ['time'], { confidence: 'medium' }),
      ]);
      expect(c.lowConfidence().map((s) => s.slug.value)).toEqual(['fsx']);
    });
  });
});
