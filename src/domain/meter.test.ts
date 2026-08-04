import { describe, expect, it } from 'vitest';
import { METER_ORDER, MeterSet, isMeterId } from './meter';

describe('isMeterId', () => {
  it('accepts the three meters and nothing else', () => {
    expect(METER_ORDER.every(isMeterId)).toBe(true);
    expect(isMeterId('requests')).toBe(false);
    expect(isMeterId('')).toBe(false);
    expect(isMeterId(undefined)).toBe(false);
    expect(isMeterId(['time'])).toBe(false);
  });
});

describe('MeterSet', () => {
  it('is order-independent, because source data is not ordered', () => {
    const a = MeterSet.of(['calls', 'time']);
    const b = MeterSet.of(['time', 'calls']);
    expect(a.equals(b)).toBe(true);
    expect(a.signature).toBe(b.signature);
  });

  it('reports free only when genuinely empty', () => {
    expect(MeterSet.none().isFree).toBe(true);
    expect(MeterSet.of([]).isFree).toBe(true);
    expect(MeterSet.of(['time']).isFree).toBe(false);
  });

  it('always returns canonical order regardless of input order', () => {
    expect(MeterSet.of(['calls', 'bytes', 'time']).toArray()).toEqual(['time', 'bytes', 'calls']);
  });

  it('de-duplicates repeated meters', () => {
    const set = MeterSet.of(['time', 'time', 'time']);
    expect(set.size).toBe(1);
    expect(set.toArray()).toEqual(['time']);
  });

  describe('parse', () => {
    it('drops unknown meters instead of throwing, so a new AWS billing shape degrades', () => {
      const set = MeterSet.parse(['time', 'quantum-flux', 'calls']);
      expect(set.toArray()).toEqual(['time', 'calls']);
    });

    it('treats non-arrays as free rather than crashing the build', () => {
      expect(MeterSet.parse(undefined).isFree).toBe(true);
      expect(MeterSet.parse(null).isFree).toBe(true);
      expect(MeterSet.parse('time').isFree).toBe(true);
      expect(MeterSet.parse({ time: true }).isFree).toBe(true);
    });
  });

  describe('signature', () => {
    it('labels the free case explicitly rather than with an empty string', () => {
      expect(MeterSet.none().signature).toBe('free');
    });

    it('distinguishes different billing shapes', () => {
      expect(MeterSet.of(['time']).signature).not.toBe(MeterSet.of(['calls']).signature);
      expect(MeterSet.of(['time', 'calls']).signature).toBe('time+calls');
    });
  });
});
