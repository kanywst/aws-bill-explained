/**
 * Layout arithmetic for the SVG diagrams.
 *
 * This lives outside the .astro components so it can be tested. That is not an
 * abstract preference: the boundary map once shipped a ring with
 * height="-40", which type-checked perfectly, threw a console error in the
 * browser, and silently dropped the innermost ring — the one the whole diagram
 * exists to show. A post-build scan catches it now, but only after a full
 * build. These functions let the arithmetic fail in milliseconds instead.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ---- Boundary map ------------------------------------------------------- */

export const RING_INNER_HEIGHT = 62;
export const RING_INNER_WIDTH = 260;
export const RING_STEP_X = 68;
export const RING_STEP_Y = 48;
export const RING_MARGIN_X = 16;
export const RING_MARGIN_TOP = 14;
export const RING_LEGEND_HEIGHT = 30;

export interface RingLayout {
  canvas: { width: number; height: number };
  rings: Box[];
}

/**
 * Concentric boxes, outermost first.
 *
 * Derived from the innermost ring outward. Deriving it the other way — fixing
 * the canvas and subtracting per ring — is what produced the negative height,
 * because the subtraction outran the total once the ring count grew.
 */
export function layoutRings(count: number, minWidth = 700): RingLayout {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`ring count must be a non-negative integer, got ${count}`);
  }

  // BOTH axes are derived from the innermost ring outward. Fixing the canvas
  // and subtracting per ring collapses the centre once the count grows — that
  // is the bug that shipped on the vertical axis, and it was still latent on
  // the horizontal one until a test walked the ring count up to six.
  const ringsHeight = count === 0 ? 0 : RING_INNER_HEIGHT + 2 * RING_STEP_Y * (count - 1);
  const neededWidth =
    count === 0 ? minWidth : RING_MARGIN_X * 2 + RING_INNER_WIDTH + 2 * RING_STEP_X * (count - 1);

  const canvas = {
    width: Math.max(minWidth, neededWidth),
    height: RING_MARGIN_TOP + ringsHeight + RING_LEGEND_HEIGHT,
  };

  const rings = Array.from({ length: count }, (_, i) => ({
    x: RING_MARGIN_X + i * RING_STEP_X,
    y: RING_MARGIN_TOP + i * RING_STEP_Y,
    width: canvas.width - RING_MARGIN_X * 2 - i * RING_STEP_X * 2,
    height: ringsHeight - i * RING_STEP_Y * 2,
  }));

  return { canvas, rings };
}

/* ---- Path diagram ------------------------------------------------------- */

export const NODE_WIDTH = 132;
export const NODE_HEIGHT = 68;
export const NODE_GAP = 104;
export const PATH_PAD_X = 12;
export const LANE_FORWARD_Y = 74;
export const LANE_RETURN_Y = 190;
export const PATH_MID_Y = 128;

export interface HopLayout {
  x1: number;
  x2: number;
  y: number;
  forward: boolean;
}

export function nodeX(index: number): number {
  return PATH_PAD_X + index * (NODE_WIDTH + NODE_GAP);
}

export function pathCanvasWidth(nodeCount: number): number {
  return PATH_PAD_X * 2 + nodeCount * NODE_WIDTH + Math.max(0, nodeCount - 1) * NODE_GAP;
}

/**
 * Only reserve the return lane when something actually flows back, otherwise a
 * one-directional diagram carries ~90px of dead space beneath it.
 */
export function pathCanvasHeight(hasReturnHop: boolean): number {
  return hasReturnHop ? 250 : 178;
}

/**
 * Resolves a hop's endpoints. Throws on an unknown node rather than letting a
 * -1 index draw the hop off-canvas, which is what it used to do: silently,
 * with no error, in a diagram about money.
 */
export function layoutHop(fromIndex: number, toIndex: number): HopLayout {
  if (fromIndex < 0 || toIndex < 0) {
    throw new Error(`hop references an unknown node (from=${fromIndex}, to=${toIndex})`);
  }
  if (fromIndex === toIndex) {
    throw new Error(`hop starts and ends at the same node (index ${fromIndex})`);
  }

  const forward = toIndex > fromIndex;
  return {
    forward,
    y: forward ? LANE_FORWARD_Y : LANE_RETURN_Y,
    // Start and end at the node edges, not the centres.
    x1: forward ? nodeX(fromIndex) + NODE_WIDTH : nodeX(fromIndex),
    x2: forward ? nodeX(toIndex) : nodeX(toIndex) + NODE_WIDTH,
  };
}

/**
 * Where a cost or "free" chip sits relative to its hop line. On the forward
 * lane it must go above, because below is where the node boxes start — a
 * collision that shipped once already.
 */
export function chipY(hop: Pick<HopLayout, 'y' | 'forward'>): number {
  return hop.forward ? hop.y - 30 : hop.y + 26;
}

/* ---- SequenceDiagram ----------------------------------------------------- */

export const SEQ_COL_WIDTH = 150;
export const SEQ_PAD_X = 10;
export const SEQ_HEAD_HEIGHT = 42;
export const SEQ_STEP_HEIGHT = 58;
export const SEQ_GUTTER_WIDTH = 178;
/** Gap between the actor headers and the first step's arrow. */
export const SEQ_FIRST_STEP_OFFSET = 34;

/**
 * Centre of an actor's lifeline. Throws on an unknown actor for the same reason
 * layoutHop does: a -1 index puts the lane at a negative x, and the arrow draws
 * off the left of the canvas without erroring — visible only if you happen to
 * look at that one step.
 */
export function seqLaneX(index: number): number {
  if (index < 0) {
    throw new Error(`step references an unknown actor (index ${index})`);
  }
  return SEQ_PAD_X + index * SEQ_COL_WIDTH + SEQ_COL_WIDTH / 2;
}

export function seqStepY(index: number): number {
  return SEQ_HEAD_HEIGHT + SEQ_FIRST_STEP_OFFSET + index * SEQ_STEP_HEIGHT;
}

/** Width of the lifeline columns, before the gutter that holds the cost chips. */
export function seqLanesWidth(actorCount: number): number {
  return SEQ_PAD_X * 2 + actorCount * SEQ_COL_WIDTH;
}

export function seqCanvasWidth(actorCount: number): number {
  return seqLanesWidth(actorCount) + SEQ_GUTTER_WIDTH;
}

export function seqCanvasHeight(stepCount: number): number {
  return seqStepY(stepCount) + 16;
}

/* ---- Shared guard ------------------------------------------------------- */

/**
 * Every box a diagram emits must be renderable. SVG treats a negative width or
 * height as an error and draws nothing, so this is the invariant worth holding.
 */
export function isRenderable(box: Box): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}
