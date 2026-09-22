/**
 * Top-view airliner silhouette, nose pointing up (local +Y).
 *
 * The path data is pure (a list of 2D segments) so it can be unit-tested;
 * `drawPlane` executes it onto a 2D canvas context.
 */

export type PlaneSegment =
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'quad'; cx: number; cy: number; x: number; y: number }
  | { op: 'close' };

/**
 * Symmetric airliner outline in a nominal 100×100 box centred at (0,0),
 * nose at the top (y = -48), tail at the bottom (y ≈ +40).
 */
export function buildPlanePath(scale = 1): PlaneSegment[] {
  const s = (n: number) => n * scale;
  const side = (m: number): PlaneSegment[] =>
    m === 1
      ? [
          { op: 'move', x: s(5), y: s(-6) },
          { op: 'line', x: s(52), y: s(26) },
          { op: 'line', x: s(52), y: s(36) },
          { op: 'line', x: s(5), y: s(24) },
          { op: 'close' },
        ]
      : [
          { op: 'move', x: s(-5), y: s(-6) },
          { op: 'line', x: s(-52), y: s(26) },
          { op: 'line', x: s(-52), y: s(36) },
          { op: 'line', x: s(-5), y: s(24) },
          { op: 'close' },
        ];

  return [
    // fuselage (nose up)
    { op: 'move', x: 0, y: s(-48) },
    { op: 'quad', cx: s(7), cy: s(-30), x: s(6), y: s(-8) },
    { op: 'line', x: s(6), y: s(20) },
    { op: 'quad', cx: s(6), cy: s(34), x: 0, y: s(38) },
    { op: 'quad', cx: s(-6), cy: s(34), x: s(-6), y: s(20) },
    { op: 'line', x: s(-6), y: s(-8) },
    { op: 'quad', cx: s(-7), cy: s(-30), x: 0, y: s(-48) },
    { op: 'close' },
    // main wings (right, then left)
    ...side(1),
    ...side(-1),
    // tail wings (right, then left)
    { op: 'move', x: s(4), y: s(24) },
    { op: 'line', x: s(24), y: s(42) },
    { op: 'line', x: s(24), y: s(48) },
    { op: 'line', x: s(4), y: s(36) },
    { op: 'close' },
    { op: 'move', x: s(-4), y: s(24) },
    { op: 'line', x: s(-24), y: s(42) },
    { op: 'line', x: s(-24), y: s(48) },
    { op: 'line', x: s(-4), y: s(36) },
    { op: 'close' },
  ];
}

/** Traces the plane path on a 2D canvas context (already translated/rotated). */
export function drawPlanePath(ctx: CanvasRenderingContext2D, segments: PlaneSegment[]): void {
  ctx.beginPath();
  for (const seg of segments) {
    switch (seg.op) {
      case 'move':
        ctx.moveTo(seg.x, seg.y);
        break;
      case 'line':
        ctx.lineTo(seg.x, seg.y);
        break;
      case 'quad':
        ctx.quadraticCurveTo(seg.cx, seg.cy, seg.x, seg.y);
        break;
      case 'close':
        ctx.closePath();
        break;
    }
  }
}

/**
 * Draws the filled plane silhouette centred at the origin, nose up, with an
 * overall size of roughly `size` px (tip-to-tail).
 */
export function drawPlane(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const segments = buildPlanePath(size / 100);
  ctx.fillStyle = color;
  drawPlanePath(ctx, segments);
  ctx.fill('nonzero');
}
