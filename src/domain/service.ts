/**
 * Domain: the Service entity.
 *
 * Identity is the slug — two records with the same slug are the same service
 * even if every other field differs. Everything else is descriptive.
 */
import { MeterSet, type MeterId } from './meter';

export const CATEGORY_IDS = [
  'compute',
  'storage',
  'database',
  'networking',
  'security',
  'integration',
  'management',
  'analytics',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

/** How sure we are of the meter classification, carried through to the UI. */
export type Confidence = 'high' | 'medium';

/**
 * Slugs arrive from several independent research passes, which name things
 * inconsistently ("amazon-s3" vs "s3"). Identity has to survive that, so the
 * vendor prefix is stripped at the boundary rather than left to leak into URLs.
 */
export function normaliseSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^(amazon|aws)-(?=.)/, '')
    .replace(/^-+|-+$/g, '');
}

export interface ServiceProps {
  slug: string;
  name: string;
  category: CategoryId;
  meters: MeterSet;
  oneLiner: string;
  trap: string;
  billOn: readonly string[];
  confidence: Confidence;
  sources: readonly string[];
  /** ISO date the classification was last checked against AWS documentation. */
  checked: string;
}

export class Service {
  readonly slug: string;
  readonly name: string;
  readonly category: CategoryId;
  readonly meters: MeterSet;
  readonly oneLiner: string;
  readonly trap: string;
  readonly billOn: readonly string[];
  readonly confidence: Confidence;
  readonly sources: readonly string[];
  readonly checked: string;

  constructor(props: ServiceProps) {
    this.slug = props.slug;
    this.name = props.name;
    this.category = props.category;
    this.meters = props.meters;
    this.oneLiner = props.oneLiner;
    this.trap = props.trap;
    this.billOn = props.billOn;
    this.confidence = props.confidence;
    this.sources = props.sources;
    this.checked = props.checked;
  }

  /**
   * How stale the classification is, in days, relative to a given date.
   * AWS repricing is the normal case, so an undated or ancient claim is a
   * defect rather than a nice-to-have.
   */
  ageInDays(asOf: Date): number {
    const then = Date.parse(this.checked);
    if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
    return Math.floor((asOf.getTime() - then) / 86_400_000);
  }

  get isFree(): boolean {
    return this.meters.isFree;
  }

  turns(meter: MeterId): boolean {
    return this.meters.has(meter);
  }

  /**
   * A claim is only as good as the page it came from. A service asserting
   * meters with no source is not publishable — see Catalogue.unsourced().
   */
  get isSourced(): boolean {
    return this.sources.length > 0;
  }

  equals(other: Service): boolean {
    return this.slug === other.slug;
  }
}
