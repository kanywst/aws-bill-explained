import { describe, expect, it } from 'vitest';
import { DEFAULT_LANG, LANGS, STRINGS, localePath, stripLocale, t } from './strings';

/**
 * These two functions build every internal link on the site and every hreflang
 * pair. They had no tests at all, which meant a locale that 404s would only
 * show up by someone clicking it.
 */
describe('localePath', () => {
  it('leaves the default locale unprefixed', () => {
    expect(localePath('en', '/')).toBe('/');
    expect(localePath('en', '/services/s3/')).toBe('/services/s3/');
  });

  it('prefixes every other locale', () => {
    expect(localePath('ja', '/')).toBe('/ja/');
    expect(localePath('ja', '/services/s3/')).toBe('/ja/services/s3/');
  });

  it('defaults to the site root', () => {
    expect(localePath('en')).toBe('/');
    expect(localePath('ja')).toBe('/ja/');
  });
});

describe('stripLocale', () => {
  it('removes a locale prefix', () => {
    expect(stripLocale('/ja/services/s3/')).toBe('/services/s3/');
    expect(stripLocale('/ja/topics/')).toBe('/topics/');
  });

  it('maps a bare locale root back to the site root', () => {
    expect(stripLocale('/ja')).toBe('/');
    expect(stripLocale('/ja/')).toBe('/');
  });

  it('leaves a default-locale path alone', () => {
    expect(stripLocale('/')).toBe('/');
    expect(stripLocale('/services/s3/')).toBe('/services/s3/');
  });

  it('does not strip a path segment that merely starts with the locale code', () => {
    // "/japan-regions/" must survive; only the "/ja/" segment is a locale.
    expect(stripLocale('/japan-regions/')).toBe('/japan-regions/');
  });
});

describe('localePath and stripLocale together', () => {
  it('round-trip: prefixing then stripping returns the original path', () => {
    const paths = ['/', '/topics/', '/services/', '/services/s3/', '/topics/boundaries/'];
    for (const lang of LANGS) {
      for (const path of paths) {
        expect(stripLocale(localePath(lang, path)), `${lang} ${path}`).toBe(path);
      }
    }
  });

  it('switching locale twice lands back where it started', () => {
    for (const path of ['/', '/services/ec2/']) {
      const toJa = localePath('ja', stripLocale(path));
      expect(localePath('en', stripLocale(toJa))).toBe(path);
    }
  });
});

describe('string bundles', () => {
  it('includes the default locale', () => {
    expect(LANGS).toContain(DEFAULT_LANG);
  });

  it('gives every locale the same set of keys, so nothing renders undefined', () => {
    const shape = (value: unknown, prefix = ''): string[] =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).flatMap(([k, v]) => shape(v, `${prefix}${k}.`))
        : [prefix];

    const reference = shape(STRINGS[DEFAULT_LANG]).sort();
    for (const lang of LANGS) {
      expect(shape(STRINGS[lang]).sort(), `locale "${lang}"`).toEqual(reference);
    }
  });

  it('leaves no string empty in any locale', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value.trim(), path).not.toBe('');
        return;
      }
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
    };
    for (const lang of LANGS) walk(STRINGS[lang], lang);
  });

  it('names all three meters in every locale', () => {
    for (const lang of LANGS) {
      const meters = t(lang).meters;
      expect(Object.keys(meters).sort()).toEqual(['bytes', 'time', 'units']);
    }
  });

  it('keeps the interpolation placeholders the cross-links depend on', () => {
    for (const lang of LANGS) {
      expect(t(lang).services.seeTopic, lang).toContain('{title}');
      expect(t(lang).services.seeEntry, lang).toContain('{name}');
    }
  });

  /**
   * The diagrams are aria-hidden and these strings ARE the accessible version of
   * them. A dropped placeholder does not throw — it silently ships a sentence
   * with a hole where the meter or the cost should be, in the one rendering a
   * screen reader user gets.
   */
  it('keeps every placeholder the diagram text alternatives interpolate', () => {
    const required: Record<string, string[]> = {
      pathAlt: ['{nodes}'],
      seqAlt: ['{actors}'],
      hopBilled: ['{from}', '{to}', '{label}', '{meter}', '{cost}'],
      hopFree: ['{from}', '{to}', '{label}'],
      ringCrossing: ['{label}', '{crossing}'],
      ringFree: ['{label}', '{crossing}'],
    };
    for (const lang of LANGS) {
      const a = t(lang).a11y as unknown as Record<string, string>;
      for (const [key, placeholders] of Object.entries(required)) {
        for (const p of placeholders) {
          expect(a[key], `${lang} a11y.${key}`).toContain(p);
        }
      }
    }
  });
});
