/**
 * Domain: the Meter.
 *
 * A Meter is the unit of the ubiquitous language on this site. AWS bills in
 * hundreds of usage types, but every one of them turns exactly one of three
 * meters. The domain layer knows nothing about rendering, locales, or Astro —
 * it only knows what a meter is and how to reason about a set of them.
 *
 * The second meter is "bytes", not "egress". It was called egress until the
 * dataset grew enough to contradict it: CloudWatch ingestion, Firehose intake
 * and NAT Gateway processing all meter gigabytes with no regard for direction.
 * "Inbound is free" is a rule about data *transfer*, not about the meter, and
 * pretending otherwise made the model wrong for about a dozen services.
 */

export const METER_IDS = ['time', 'bytes', 'calls'] as const;

export type MeterId = (typeof METER_IDS)[number];

/** Canonical display order. Time first because it dominates most bills. */
export const METER_ORDER: readonly MeterId[] = METER_IDS;

export function isMeterId(value: unknown): value is MeterId {
  return typeof value === 'string' && (METER_IDS as readonly string[]).includes(value);
}

/**
 * A set of meters, as a value object.
 *
 * Deliberately immutable and order-independent: two services that turn the same
 * meters have equal MeterSets regardless of the order the source data listed
 * them in. Equality matters because "which services bill like this one?" is a
 * question the catalogue answers by comparing profiles.
 */
export class MeterSet {
  private readonly ids: ReadonlySet<MeterId>;

  private constructor(ids: ReadonlySet<MeterId>) {
    this.ids = ids;
  }

  static of(ids: readonly MeterId[]): MeterSet {
    return new MeterSet(new Set(ids));
  }

  static none(): MeterSet {
    return new MeterSet(new Set());
  }

  has(id: MeterId): boolean {
    return this.ids.has(id);
  }

  /**
   * A service with no meters is free. This is a first-class concept here, not
   * an empty-array edge case: knowing what costs nothing is half the value of
   * the catalogue.
   */
  get isFree(): boolean {
    return this.ids.size === 0;
  }

  get size(): number {
    return this.ids.size;
  }

  /** Always in canonical order, whatever order the source used. */
  toArray(): MeterId[] {
    return METER_ORDER.filter((id) => this.ids.has(id));
  }

  equals(other: MeterSet): boolean {
    return this.size === other.size && this.toArray().every((id) => other.has(id));
  }

  /** Stable key for grouping services that bill the same way. */
  get signature(): string {
    return this.isFree ? 'free' : this.toArray().join('+');
  }
}
