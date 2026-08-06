/**
 * Domain: the identity of a Service.
 *
 * This exists because identity was the one thing the model could not protect.
 * Research arrives from several independent passes that disagree about naming
 * ("amazon-s3" vs "s3"), and while a free `normaliseSlug` function fixed the
 * spelling, nothing stopped a Service being constructed with a slug that had
 * never been through it. A value object closes that: the only way to hold a
 * slug is to have gone through the constructor, so an invalid one cannot exist.
 *
 * Slugs are also URLs. An unnormalised slug is a broken route, not a cosmetic
 * problem.
 */

export class InvalidServiceSlugError extends Error {
  constructor(raw: string, reason: string) {
    super(`Invalid service slug "${raw}": ${reason}`);
    this.name = 'InvalidServiceSlugError';
  }
}

/** What a slug must look like once normalised: URL-safe, no leading vendor. */
const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ServiceSlug {
  private constructor(readonly value: string) {}

  /**
   * Normalises then validates. Throws rather than returning something
   * approximate, because a slug that "mostly worked" is a 404 nobody notices.
   */
  static of(raw: unknown): ServiceSlug {
    if (typeof raw !== 'string') {
      throw new InvalidServiceSlugError(String(raw), 'not a string');
    }

    const normalised = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      // Vendor prefixes vary between research passes; identity must not. The
      // lookahead keeps "aws" and "amazon" intact when that is the whole name.
      .replace(/^(?:amazon|aws)-(?=.)/, '')
      .replace(/^-+|-+$/g, '');

    if (normalised === '') {
      throw new InvalidServiceSlugError(raw, 'nothing left after normalisation');
    }
    if (!SHAPE.test(normalised)) {
      throw new InvalidServiceSlugError(
        raw,
        `normalised to "${normalised}", which is not URL-safe`,
      );
    }

    return new ServiceSlug(normalised);
  }

  /** For callers that would rather branch than catch. */
  static tryOf(raw: unknown): ServiceSlug | undefined {
    try {
      return ServiceSlug.of(raw);
    } catch {
      return undefined;
    }
  }

  equals(other: ServiceSlug): boolean {
    return this.value === other.value;
  }

  /** Lets a slug drop straight into a template literal or a URL. */
  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
