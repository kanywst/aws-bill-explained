/**
 * Infrastructure: turns the researched JSON files into domain objects.
 *
 * This is the anti-corruption layer. The JSON is written by several independent
 * research passes and is inconsistent by nature — different slug conventions,
 * occasional unknown meters, missing optional fields. Everything downstream of
 * here gets clean domain objects or a loud failure; nothing downstream ever
 * sees a raw record.
 */
import { MeterSet, isMeterId, type MeterId } from '../domain/meter';
import { ServiceSlug } from '../domain/service-slug';
import { Catalogue } from '../domain/catalogue';
import { Service, isCategoryId, type CategoryId, type Confidence } from '../domain/service';

import compute from '../data/services/compute.json';
import storage from '../data/services/storage.json';
import database from '../data/services/database.json';
import networking from '../data/services/networking.json';
import security from '../data/services/security.json';
import integration from '../data/services/integration.json';
import management from '../data/services/management.json';
import analytics from '../data/services/analytics.json';

export class InvalidServiceRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidServiceRecordError';
  }
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const asConfidence = (value: unknown): Confidence => (value === 'high' ? 'high' : 'medium');

/**
 * Both renamed meters keep their old spelling as an inbound alias. The dataset
 * itself has been migrated, so these exist for research written against the
 * older names rather than as a permanent shim — which is what an
 * anti-corruption layer is for.
 */
const METER_ALIASES: Record<string, MeterId> = { egress: 'bytes', units: 'units' };

/**
 * Defensive parsing lives here rather than in MeterSet, because tolerating junk
 * is a property of the untrusted source, not of the model.
 *
 * Dropping an unrecognised meter used to leave an empty set, which the domain
 * reads as "free" — so a new AWS billing shape degraded not to "we don't know"
 * but to a confident claim that the service costs nothing. The drop is now
 * reported alongside the set so the model can tell those two apart.
 */
const asMeters = (value: unknown): { meters: MeterSet; dropped: boolean } => {
  if (!Array.isArray(value)) return { meters: MeterSet.none(), dropped: false };

  const named = value.map((m) => (typeof m === 'string' ? (METER_ALIASES[m] ?? m) : m));
  const ids = named.filter(isMeterId);

  return { meters: MeterSet.of(ids), dropped: ids.length < named.length };
};

/** Validates and normalises one raw record. Throws rather than guessing. */
export function toService(raw: unknown): Service {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidServiceRecordError('service record is not an object');
  }
  const r = raw as Record<string, unknown>;

  const slug = ServiceSlug.tryOf(r.slug);
  if (!slug) {
    throw new InvalidServiceRecordError(
      `service record has no usable slug (got ${String(r.slug)})`,
    );
  }
  if (typeof r.name !== 'string' || r.name.trim() === '') {
    throw new InvalidServiceRecordError(`service "${slug.value}" has no name`);
  }
  if (!isCategoryId(r.category)) {
    throw new InvalidServiceRecordError(
      `service "${slug.value}" has unknown category "${String(r.category)}"`,
    );
  }

  const { meters, dropped } = asMeters(r.meters);

  return new Service({
    slug,
    name: r.name,
    category: r.category as CategoryId,
    // Unknown meter strings are dropped rather than thrown on: a new AWS
    // billing shape should degrade to "we don't know" and not break the build.
    meters,
    unclassified: dropped,
    oneLiner: typeof r.oneLiner === 'string' ? r.oneLiner : '',
    trap: typeof r.trap === 'string' ? r.trap : '',
    billOn: asStrings(r.billOn),
    confidence: asConfidence(r.confidence),
    sources: asStrings(r.sources),
    checked: typeof r.checked === 'string' ? r.checked : '',
  });
}

const SOURCES: unknown[][] = [
  compute,
  storage,
  database,
  networking,
  security,
  integration,
  management,
  analytics,
];

let cached: Catalogue | undefined;

/** The catalogue, built once per process. */
export function loadCatalogue(): Catalogue {
  cached ??= Catalogue.from(SOURCES.flat().map(toService));
  return cached;
}
