/**
 * Infrastructure: turns the researched JSON files into domain objects.
 *
 * This is the anti-corruption layer. The JSON is written by several independent
 * research passes and is inconsistent by nature — different slug conventions,
 * occasional unknown meters, missing optional fields. Everything downstream of
 * here gets clean domain objects or a loud failure; nothing downstream ever
 * sees a raw record.
 */
import { MeterSet } from '../domain/meter';
import { Catalogue } from '../domain/catalogue';
import { Service, isCategoryId, normaliseSlug, type Confidence } from '../domain/service';

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

/** Validates and normalises one raw record. Throws rather than guessing. */
export function toService(raw: unknown): Service {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidServiceRecordError('service record is not an object');
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.slug !== 'string' || r.slug.trim() === '') {
    throw new InvalidServiceRecordError('service record has no slug');
  }
  if (typeof r.name !== 'string' || r.name.trim() === '') {
    throw new InvalidServiceRecordError(`service "${r.slug}" has no name`);
  }
  if (!isCategoryId(r.category)) {
    throw new InvalidServiceRecordError(
      `service "${r.slug}" has unknown category "${String(r.category)}"`,
    );
  }

  return new Service({
    slug: normaliseSlug(r.slug),
    name: r.name,
    category: r.category,
    // Unknown meter strings are dropped rather than thrown on: a new AWS
    // billing shape should degrade to "we don't know" and not break the build.
    meters: MeterSet.parse(r.meters),
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
