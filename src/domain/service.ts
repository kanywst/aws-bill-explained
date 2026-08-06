/**
 * Domain: the Service entity.
 *
 * Identity is the slug — two records with the same slug are the same service
 * even if every other field differs.
 *
 * The constructor enforces the editorial rules rather than leaving them to a
 * test over the real dataset. That distinction matters: a test can only catch
 * a bad record that is already committed, while a constructor makes the bad
 * record impossible to build in the first place. These limits are not styling
 * preferences — a one-liner that runs long stops being something a reader can
 * hold in their head, which is the entire premise of the site.
 */
import { MeterSet, type MeterId } from './meter';
import { ServiceSlug } from './service-slug';

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

/** Editorial limits, owned by the domain so tests can assert against them. */
export const MAX_ONE_LINER = 120;
export const MAX_TRAP = 220;

/**
 * Sources must be AWS's own words. The site's entire claim is that each
 * classification is backed by a primary page, so this belongs in the model
 * rather than in a test over the committed data — a test only catches a bad
 * record after somebody has written it down.
 */
const AWS_SOURCE =
  /^https:\/\/(aws\.amazon\.com|docs\.aws\.amazon\.com|repost\.aws|pricing\.[a-z0-9-]+\.amazonaws\.com)\//;

export class InvalidServiceError extends Error {
  constructor(slug: string, reason: string) {
    super(`Service "${slug}": ${reason}`);
    this.name = 'InvalidServiceError';
  }
}

export interface ServiceProps {
  slug: ServiceSlug;
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
  /**
   * True when the source data named meters this model does not recognise, so
   * the meter set below is incomplete rather than empty.
   */
  unclassified?: boolean;
}

export class Service {
  readonly slug: ServiceSlug;
  readonly name: string;
  readonly category: CategoryId;
  readonly meters: MeterSet;
  readonly oneLiner: string;
  readonly trap: string;
  readonly billOn: readonly string[];
  readonly confidence: Confidence;
  readonly sources: readonly string[];
  readonly checked: string;
  readonly unclassified: boolean;

  constructor(props: ServiceProps) {
    const id = props.slug.value;

    if (props.name.trim() === '') {
      throw new InvalidServiceError(id, 'name is empty');
    }
    if (!isCategoryId(props.category)) {
      throw new InvalidServiceError(id, `unknown category "${String(props.category)}"`);
    }
    if (props.oneLiner.trim() === '') {
      throw new InvalidServiceError(id, 'oneLiner is empty');
    }
    if (props.oneLiner.length > MAX_ONE_LINER) {
      throw new InvalidServiceError(
        id,
        `oneLiner is ${props.oneLiner.length} characters, over the ${MAX_ONE_LINER} limit`,
      );
    }
    if (props.trap.trim() === '') {
      throw new InvalidServiceError(id, 'trap is empty');
    }
    if (props.trap.length > MAX_TRAP) {
      throw new InvalidServiceError(
        id,
        `trap is ${props.trap.length} characters, over the ${MAX_TRAP} limit`,
      );
    }
    // A rate in the prose goes stale silently; the meter it turns does not.
    for (const [field, text] of [
      ['oneLiner', props.oneLiner],
      ['trap', props.trap],
    ] as const) {
      if (/\$\d/.test(text)) {
        throw new InvalidServiceError(id, `${field} quotes a dollar rate`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.checked) || Number.isNaN(Date.parse(props.checked))) {
      throw new InvalidServiceError(id, `checked date "${props.checked}" is not an ISO date`);
    }
    if (props.sources.length === 0) {
      throw new InvalidServiceError(id, 'has no source');
    }
    for (const source of props.sources) {
      if (!AWS_SOURCE.test(source)) {
        throw new InvalidServiceError(id, `source "${source}" is not an AWS-controlled page`);
      }
    }

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
    this.unclassified = props.unclassified ?? false;
  }

  /**
   * Free means "turns no meters", which is a claim. An empty meter set can
   * also mean the parser threw away meter names it did not recognise, and
   * announcing that as free is the most expensive thing this site could get
   * wrong — so an unclassified service is never free.
   */
  get isFree(): boolean {
    return !this.unclassified && this.meters.isFree;
  }

  /** The honest third state: we do not know what this one turns. */
  get isUnclassified(): boolean {
    return this.unclassified;
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

  equals(other: Service): boolean {
    return this.slug.equals(other.slug);
  }
}
