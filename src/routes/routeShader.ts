/**
 * Shared GLSL for route tubes.
 *
 * The tube's `uv.x` runs 0 → 1 along the route (origin → destination), which
 * drives the draw-on progress, the end fades and the flowing dash pattern.
 * A "limb fade" softly dims tube fragments as they round the globe's visible
 * edge, so arcs melt into the surface instead of hard-clipping at the
 * silhouette (the depth test still hides the far side).
 */

export const ROUTE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ROUTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uProgress;
uniform float uTime;
uniform float uDashCount;
uniform float uDashSolid;
uniform float uFlow;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  float x = vUv.x;

  // Draw-on: visible up to uProgress with a soft leading edge.
  float draw = 1.0 - smoothstep(uProgress - 0.015, uProgress + 0.002, x);

  // Fade into the surface at both endpoints.
  float ends = smoothstep(0.0, 0.03, x) * (1.0 - smoothstep(0.97, 1.0, x));

  // Flowing dashes.
  float d = fract(x * uDashCount - uTime * uFlow);
  float dash = 1.0 - smoothstep(uDashSolid, uDashSolid + 0.05, d);

  // Soft limb fade: dot(surface direction, camera direction) shrinks toward
  // the visible edge of the globe; ease the alpha down across that band.
  float facing = dot(normalize(vWorld), normalize(cameraPosition));
  float limb = mix(0.35, 1.0, smoothstep(0.05, 0.45, facing));

  float alpha = uOpacity * draw * ends * dash * limb;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
