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
    const a = MeterSet.of(['units', 'time']);
    const b = MeterSet.of(['time', 'units']);
    expect(a.equals(b)).toBe(true);
    expect(a.signature).toBe(b.signature);
  });

  it('reports free only when genuinely empty', () => {
    expect(MeterSet.none().isFree).toBe(true);
    expect(MeterSet.of([]).isFree).toBe(true);
    expect(MeterSet.of(['time']).isFree).toBe(false);
  });

  it('always returns canonical order regardless of input order', () => {
    expect(MeterSet.of(['units', 'bytes', 'time']).toArray()).toEqual(['time', 'bytes', 'units']);
  });

  it('de-duplicates repeated meters', () => {
    const set = MeterSet.of(['time', 'time', 'time']);
    expect(set.size).toBe(1);
    expect(set.toArray()).toEqual(['time']);
  });

  describe('signature', () => {
    it('labels the free case explicitly rather than with an empty string', () => {
      expect(MeterSet.none().signature).toBe('free');
    });

    it('distinguishes different billing shapes', () => {
      expect(MeterSet.of(['time']).signature).not.toBe(MeterSet.of(['units']).signature);
      expect(MeterSet.of(['time', 'units']).signature).toBe('time+units');
    });
  });
});
