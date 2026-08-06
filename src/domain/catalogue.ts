/**
 * Domain: the Catalogue aggregate.
 *
 * The Catalogue is the consistency boundary over Services. It owns the rule
 * that slugs are unique, and it is the only place allowed to answer questions
 * that span more than one service ("what else bills like this?", "what is
 * actually free?"). Pages ask the Catalogue; they never filter arrays
 * themselves, so a query's meaning lives in one place.
 */
import { METER_ORDER, type MeterId } from './meter';
import { CATEGORY_IDS, type CategoryId, type Service } from './service';

export class DuplicateServiceError extends Error {
  constructor(slug: string) {
    super(`Catalogue already contains a service with slug "${slug}"`);
    this.name = 'DuplicateServiceError';
  }
}

export class Catalogue {
  private readonly bySlug: Map<string, Service>;

  private constructor(bySlug: Map<string, Service>) {
    this.bySlug = bySlug;
  }

  /** Throws on duplicate slugs — silently losing a service would be worse. */
  static from(services: readonly Service[]): Catalogue {
    const bySlug = new Map<string, Service>();
    for (const service of services) {
      const key = service.slug.value;
      if (bySlug.has(key)) throw new DuplicateServiceError(key);
      bySlug.set(key, service);
    }
    return new Catalogue(bySlug);
  }

  get size(): number {
    return this.bySlug.size;
  }

  find(slug: string): Service | undefined {
    return this.bySlug.get(slug);
  }

  /** Alphabetical by display name — the only order a reader can predict. */
  all(): Service[] {
    return [...this.bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  inCategory(category: CategoryId): Service[] {
    return this.all().filter((s) => s.category === category);
  }

  turning(meter: MeterId): Service[] {
    return this.all().filter((s) => s.turns(meter));
  }

  /** Services that cost nothing on their own. */
  free(): Service[] {
    return this.all().filter((s) => s.isFree);
  }

  /** Every meter at once — the services that are hardest to reason about. */
  turningAll(): Service[] {
    return this.all().filter((s) => s.meters.size === METER_ORDER.length);
  }

  /** Categories that actually have entries, in canonical order. */
  categories(): CategoryId[] {
    const present = new Set(this.all().map((s) => s.category));
    return CATEGORY_IDS.filter((c) => present.has(c));
  }

  countByMeter(): Record<MeterId, number> {
    // Derived from METER_ORDER rather than written out, so renaming a meter
    // cannot leave a stale key behind.
    const counts = Object.fromEntries(METER_ORDER.map((m) => [m, 0])) as Record<MeterId, number>;
    for (const service of this.bySlug.values()) {
      for (const meter of METER_ORDER) {
        if (service.turns(meter)) counts[meter] += 1;
      }
    }
    return counts;
  }

  /** Services grouped by identical meter profile. */
  byBillingShape(): Map<string, Service[]> {
    const groups = new Map<string, Service[]>();
    for (const service of this.all()) {
      const key = service.meters.signature;
      groups.set(key, [...(groups.get(key) ?? []), service]);
    }
    return groups;
  }

  /**
   * Editorial guards. These are domain rules, not lint: a claim about someone's
   * bill with nothing behind it should never ship.
   */
  unsourced(): Service[] {
    return this.all().filter((s) => !s.isSourced);
  }

  lowConfidence(): Service[] {
    return this.all().filter((s) => s.confidence !== 'high');
  }
}
