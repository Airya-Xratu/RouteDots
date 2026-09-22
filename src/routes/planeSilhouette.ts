/**
 * Top-view airliner silhouette, nose pointing up (local +Y).
 *
 * A rounded, friendly outline: smooth fuselage, swept wings with rounded
 * tips, and a small rounded tail. The path data is pure (a list of 2D
 * segments) so it can be unit-tested; `drawPlane` executes it onto a 2D
 * canvas context.
 */

export type PlaneSegment =
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'quad'; cx: number; cy: number; x: number; y: number }
  | { op: 'close' };

/**
 * Symmetric airliner outline in a nominal 100×100 box centred at (0,0):
 * nose at the top (y = -50), tail bottom (≈ +46), wingtips at x = ±50.
 */
export function buildPlanePath(scale = 1): PlaneSegment[] {
  const s = (n: number) => n * scale;
  const wing = (m: number): PlaneSegment[] =>
    m === 1
      ? [
          { op: 'move', x: s(6), y: s(-8) },
          { op: 'quad', cx: s(26), cy: s(-2), x: s(42), y: s(14) },
          { op: 'quad', cx: s(50), cy: s(21), x: s(50), y: s(30) },
          { op: 'quad', cx: s(50), cy: s(36), x: s(43), y: s(34) },
          { op: 'line', x: s(10), y: s(22) },
          { op: 'quad', cx: s(6), cy: s(20), x: s(6), y: s(12) },
          { op: 'close' },
        ]
      : [
          { op: 'move', x: s(-6), y: s(-8) },
          { op: 'quad', cx: s(-26), cy: s(-2), x: s(-42), y: s(14) },
          { op: 'quad', cx: s(-50), cy: s(21), x: s(-50), y: s(30) },
          { op: 'quad', cx: s(-50), cy: s(36), x: s(-43), y: s(34) },
          { op: 'line', x: s(-10), y: s(22) },
          { op: 'quad', cx: s(-6), cy: s(20), x: s(-6), y: s(12) },
          { op: 'close' },
        ];

  const tail = (m: number): PlaneSegment[] =>
    m === 1
      ? [
          { op: 'move', x: s(5), y: s(20) },
          { op: 'quad', cx: s(14), cy: s(26), x: s(21), y: s(36) },
          { op: 'quad', cx: s(25), cy: s(42), x: s(21), y: s(46) },
          { op: 'quad', cx: s(18), cy: s(49), x: s(14), y: s(45) },
          { op: 'line', x: s(6), y: s(34) },
          { op: 'quad', cx: s(5), cy: s(30), x: s(5), y: s(25) },
          { op: 'close' },
        ]
      : [
          { op: 'move', x: s(-5), y: s(20) },
          { op: 'quad', cx: s(-14), cy: s(26), x: s(-21), y: s(36) },
          { op: 'quad', cx: s(-25), cy: s(42), x: s(-21), y: s(46) },
          { op: 'quad', cx: s(-18), cy: s(49), x: s(-14), y: s(45) },
          { op: 'line', x: s(-6), y: s(34) },
          { op: 'quad', cx: s(-5), cy: s(30), x: s(-5), y: s(25) },
          { op: 'close' },
        ];

  return [
    // fuselage (rounded nose up, rounded tail down)
    { op: 'move', x: 0, y: s(-50) },
    { op: 'quad', cx: s(9), cy: s(-34), x: s(7), y: s(-12) },
    { op: 'line', x: s(7), y: s(16) },
    { op: 'quad', cx: s(7), cy: s(34), x: 0, y: s(42) },
    { op: 'quad', cx: s(-7), cy: s(34), x: s(-7), y: s(16) },
    { op: 'line', x: s(-7), y: s(-12) },
    { op: 'quad', cx: s(-9), cy: s(-34), x: 0, y: s(-50) },
    { op: 'close' },
    // main wings (right, then left)
    ...wing(1),
    ...wing(-1),
    // tail wings (right, then left)
    ...tail(1),
    ...tail(-1),
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
