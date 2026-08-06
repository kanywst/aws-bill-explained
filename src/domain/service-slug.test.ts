import { describe, expect, it } from 'vitest';
import { InvalidServiceSlugError, ServiceSlug } from './service-slug';

describe('ServiceSlug', () => {
  it('strips the vendor prefix so independent research passes agree on identity', () => {
    expect(ServiceSlug.of('amazon-s3').value).toBe('s3');
    expect(ServiceSlug.of('aws-lambda').value).toBe('lambda');
    expect(ServiceSlug.of('s3').value).toBe('s3');
  });

  it('keeps a prefix that is the whole name, so nothing becomes empty', () => {
    expect(ServiceSlug.of('aws').value).toBe('aws');
    expect(ServiceSlug.of('amazon').value).toBe('amazon');
  });

  it('collapses case, spacing and punctuation into a URL-safe form', () => {
    expect(ServiceSlug.of('Amazon EC2 Auto Scaling').value).toBe('ec2-auto-scaling');
    expect(ServiceSlug.of('  API_Gateway  ').value).toBe('api-gateway');
    expect(ServiceSlug.of('(NAT) Gateway!').value).toBe('nat-gateway');
    expect(ServiceSlug.of('--s3--').value).toBe('s3');
  });

  it('is idempotent', () => {
    for (const raw of ['amazon-s3', 'AWS Step Functions', '  ec2 ', '(NAT) Gateway!']) {
      const once = ServiceSlug.of(raw);
      expect(ServiceSlug.of(once.value).value).toBe(once.value);
    }
  });

  it('refuses input that cannot become a slug, rather than approximating one', () => {
    expect(() => ServiceSlug.of('')).toThrow(InvalidServiceSlugError);
    expect(() => ServiceSlug.of('   ')).toThrow(InvalidServiceSlugError);
    expect(() => ServiceSlug.of('!!!')).toThrow(InvalidServiceSlugError);
    expect(() => ServiceSlug.of('---')).toThrow(InvalidServiceSlugError);
    expect(() => ServiceSlug.of(null)).toThrow(InvalidServiceSlugError);
    expect(() => ServiceSlug.of(42)).toThrow(InvalidServiceSlugError);
  });

  it('offers tryOf for callers that would rather branch than catch', () => {
    expect(ServiceSlug.tryOf('amazon-s3')?.value).toBe('s3');
    expect(ServiceSlug.tryOf('!!!')).toBeUndefined();
  });

  it('compares by value', () => {
    expect(ServiceSlug.of('amazon-s3').equals(ServiceSlug.of('s3'))).toBe(true);
    expect(ServiceSlug.of('s3').equals(ServiceSlug.of('ec2'))).toBe(false);
  });

  it('drops into a template literal without ceremony', () => {
    expect(`/services/${ServiceSlug.of('amazon-s3')}/`).toBe('/services/s3/');
    expect(JSON.stringify({ slug: ServiceSlug.of('aws-lambda') })).toBe('{"slug":"lambda"}');
  });

  it('always produces something safe to put in a URL path', () => {
    const messy = ['Amazon S3!!!', '  AWS   Step   Functions  ', 'iot/core', 'a.b.c'];
    for (const raw of messy) {
      expect(ServiceSlug.of(raw).value).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
