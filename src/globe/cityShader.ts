/**
 * GLSL for the blinking airport-city markers (see `markers/blinkPattern.ts`,
 * which is the written-down definition of these curves — the shaders evaluate
 * the same math on the GPU so the blink costs nothing per frame but a
 * `uTime` uniform).
 *
 * Both markers are `InstancedMesh`es: one instance per city, oriented so its
 * local +Z is the outward surface normal. The cycle position is
 * `fract(uTime / uPeriod + aPhase)` with a per-instance golden-ratio phase,
 * so cities never blink in unison.
 */

/** Solid dot: breathes between dim and full opacity. */
export const CITY_DOT_VERTEX = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPeriod;
uniform float uDim;
varying float vAlpha;

float pulse(float p) {
  return 0.5 + 0.5 * cos(p * 6.28318530718);
}

void main() {
  float progress = fract(uTime / uPeriod + aPhase);
  vAlpha = uDim + (1.0 - uDim) * pow(pulse(progress), 1.5);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export const CITY_DOT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

/** Expanding ring: grows and fades over the same cycle. */
export const CITY_RING_VERTEX = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPeriod;
uniform float uGrow;
uniform float uPeakOpacity;
varying float vAlpha;

void main() {
  float progress = fract(uTime / uPeriod + aPhase);
  float scale = 1.0 + progress * uGrow;
  vAlpha = uPeakOpacity * (1.0 - progress);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position * scale, 1.0);
}
`;

export const CITY_RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}
`;
