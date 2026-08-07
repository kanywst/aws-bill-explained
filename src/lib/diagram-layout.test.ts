import { describe, expect, it } from 'vitest';
import {
  RING_INNER_HEIGHT,
  chipY,
  isRenderable,
  layoutHop,
  layoutRings,
  nodeX,
  NODE_HEIGHT,
  PATH_MID_Y,
  pathCanvasHeight,
  pathCanvasWidth,
  SEQ_COL_WIDTH,
  SEQ_GUTTER_WIDTH,
  seqCanvasHeight,
  seqCanvasWidth,
  seqLaneX,
  seqLanesWidth,
  seqStepY,
} from './diagram-layout';

describe('layoutRings', () => {
  /**
   * The regression this file exists for. The boundary map shipped with
   * height="-40" on its innermost ring, so the free centre — the point of the
   * whole diagram — was never drawn.
   */
  it('never produces a ring that SVG refuses to render', () => {
    for (let count = 1; count <= 12; count += 1) {
      for (const ring of layoutRings(count).rings) {
        expect(isRenderable(ring), `ring count ${count}: ${JSON.stringify(ring)}`).toBe(true);
      }
    }
  });

  it('gives the innermost ring exactly the inner height, whatever the count', () => {
    for (const count of [1, 2, 4, 7]) {
      const { rings } = layoutRings(count);
      expect(rings.at(-1)?.height).toBe(RING_INNER_HEIGHT);
    }
  });

  it('nests every ring strictly inside the one outside it', () => {
    const { rings } = layoutRings(5);
    for (let i = 1; i < rings.length; i += 1) {
      const outer = rings[i - 1]!;
      const inner = rings[i]!;
      expect(inner.x).toBeGreaterThan(outer.x);
      expect(inner.y).toBeGreaterThan(outer.y);
      expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);
    }
  });

  it('keeps every ring inside the canvas', () => {
    const { canvas, rings } = layoutRings(4);
    for (const ring of rings) {
      expect(ring.x).toBeGreaterThanOrEqual(0);
      expect(ring.y).toBeGreaterThanOrEqual(0);
      expect(ring.x + ring.width).toBeLessThanOrEqual(canvas.width);
      expect(ring.y + ring.height).toBeLessThanOrEqual(canvas.height);
    }
  });

  it('leaves room under the rings for the legend', () => {
    const { canvas, rings } = layoutRings(4);
    const bottom = Math.max(...rings.map((r) => r.y + r.height));
    expect(canvas.height - bottom).toBeGreaterThan(0);
  });

  it('handles the empty case without inventing a canvas', () => {
    const { rings } = layoutRings(0);
    expect(rings).toEqual([]);
  });

  it('rejects a nonsensical ring count rather than emitting NaN', () => {
    expect(() => layoutRings(-1)).toThrow(RangeError);
    expect(() => layoutRings(1.5)).toThrow(RangeError);
  });

  it('narrows far enough that a wide diagram still fits its rings', () => {
    // Six rings at the default width is the practical ceiling; past that the
    // horizontal step would invert the innermost box.
    for (const ring of layoutRings(6).rings) {
      expect(ring.width).toBeGreaterThan(0);
    }
  });
});

describe('layoutHop', () => {
  it('throws on an unknown node instead of drawing off-canvas', () => {
    expect(() => layoutHop(-1, 2)).toThrow(/unknown node/);
    expect(() => layoutHop(0, -1)).toThrow(/unknown node/);
  });

  it('throws on a hop that goes nowhere', () => {
    expect(() => layoutHop(1, 1)).toThrow(/same node/);
  });

  it('puts left-to-right traffic on the forward lane and back again on the return lane', () => {
    expect(layoutHop(0, 2).forward).toBe(true);
    expect(layoutHop(2, 0).forward).toBe(false);
    expect(layoutHop(0, 2).y).not.toBe(layoutHop(2, 0).y);
  });

  it('starts and ends at node edges, never at their centres', () => {
    const hop = layoutHop(0, 1);
    expect(hop.x1).toBeGreaterThan(nodeX(0));
    expect(hop.x2).toBeLessThan(nodeX(1) + 1);
    expect(hop.x2).toBeGreaterThan(hop.x1);
  });

  it('keeps hops within the canvas for any adjacent pair', () => {
    const nodes = 4;
    const width = pathCanvasWidth(nodes);
    for (let i = 0; i < nodes - 1; i += 1) {
      for (const hop of [layoutHop(i, i + 1), layoutHop(i + 1, i)]) {
        expect(Math.min(hop.x1, hop.x2)).toBeGreaterThanOrEqual(0);
        expect(Math.max(hop.x1, hop.x2)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe('chipY', () => {
  /**
   * The other shipped collision: a "free" label on the forward lane landed on
   * top of the node boxes below it.
   */
  it('keeps a forward-lane chip clear of the node boxes underneath', () => {
    const hop = layoutHop(0, 1);
    const nodeTop = PATH_MID_Y - NODE_HEIGHT / 2;
    expect(chipY(hop)).toBeLessThan(nodeTop);
  });

  it('keeps a return-lane chip clear of the node boxes above it', () => {
    const hop = layoutHop(1, 0);
    const nodeBottom = PATH_MID_Y + NODE_HEIGHT / 2;
    expect(chipY(hop)).toBeGreaterThan(nodeBottom);
  });
});

describe('path canvas', () => {
  it('reserves the return lane only when traffic flows back', () => {
    expect(pathCanvasHeight(true)).toBeGreaterThan(pathCanvasHeight(false));
  });

  it('grows with the node count and stays positive at one node', () => {
    expect(pathCanvasWidth(1)).toBeGreaterThan(0);
    expect(pathCanvasWidth(3)).toBeGreaterThan(pathCanvasWidth(2));
  });
});

describe('sequence geometry', () => {
  /**
   * The bug this suite exists to prevent. An unknown actor id makes findIndex
   * return -1, and the old inline version happily computed a negative x, so the
   * arrow for that one step drew off the left edge of the canvas with no error.
   * The same class of bug shipped once in BoundaryMap.
   */
  it('refuses a negative actor index instead of drawing off-canvas', () => {
    expect(() => seqLaneX(-1)).toThrow(/unknown actor/);
  });

  it('keeps every lane on the canvas', () => {
    for (let actors = 1; actors <= 6; actors += 1) {
      for (let i = 0; i < actors; i += 1) {
        expect(seqLaneX(i), `actor ${i} of ${actors}`).toBeGreaterThan(0);
        expect(seqLaneX(i), `actor ${i} of ${actors}`).toBeLessThan(seqLanesWidth(actors));
      }
    }
  });

  it('spaces lanes by exactly one column', () => {
    expect(seqLaneX(1) - seqLaneX(0)).toBe(SEQ_COL_WIDTH);
    expect(seqLaneX(4) - seqLaneX(3)).toBe(SEQ_COL_WIDTH);
  });

  /*
   * The three assertions below are pinned to what the component actually draws
   * rather than to the formulas, because a test written against the formula
   * cannot fail: an earlier version asserted things like
   * `seqCanvasWidth(n) - GUTTER === seqLanesWidth(n)`, which is that function's
   * own definition restated.
   *
   * Offsets come from SequenceDiagram.astro: the label sits at `y - 9`, the
   * gutter rule at `y + 18`, and the widest actor box spans COL_W - 24 centred
   * on the lane.
   */
  it('keeps the widest actor box clear of the cost gutter', () => {
    for (let actors = 1; actors <= 6; actors += 1) {
      const boxRight = seqLaneX(actors - 1) + SEQ_COL_WIDTH / 2 - 12;
      const gutterStart = seqCanvasWidth(actors) - SEQ_GUTTER_WIDTH;
      expect(boxRight, `${actors} actors`).toBeLessThanOrEqual(gutterStart);
    }
  });

  it('leaves room below the last step for the gutter rule it draws', () => {
    for (let steps = 1; steps <= 8; steps += 1) {
      expect(seqStepY(steps - 1) + 18, `${steps} steps`).toBeLessThan(seqCanvasHeight(steps));
    }
  });

  it('spaces steps wide enough that a label never lands on its neighbour', () => {
    // Each step occupies y-9 (label) through y+18 (gutter rule): 27px.
    expect(seqStepY(1) - seqStepY(0)).toBeGreaterThan(27);
  });
});

describe('isRenderable', () => {
  it('rejects exactly what SVG rejects', () => {
    expect(isRenderable({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(isRenderable({ x: 0, y: 0, width: -1, height: 10 })).toBe(false);
    expect(isRenderable({ x: 0, y: 0, width: 10, height: 0 })).toBe(false);
    expect(isRenderable({ x: NaN, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
