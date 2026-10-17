/**
 * Shared GLSL for route tubes.
 *
 * The tube's `uv.x` runs 0 → 1 along the route (origin → destination), which
 * drives the draw-on progress, the end fades and the flowing dash pattern.
 * A "limb fade" softly dims tube fragments as they round the globe's visible
 * edge, so arcs melt into the surface instead of hard-clipping at the
 * silhouette (the depth test still hides the far side).
 *
 * For round-trip flight on a single edge the shader exposes two extra
 * uniforms: `uDirection` flips the dash flow to match the plane's heading
 * (+1 outbound / -1 return), and `uTrail` lets the renderer draw a growing
 * trail behind the plane on both legs without needing a second tube.
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
uniform float uDirection;
uniform float uTrail;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  float x = vUv.x;

  // Initial draw-on: visible up to uProgress with a soft leading edge.
  // (uProgress reaches 1 after drawDurationMs and stays there — the edge
  // stays fully drawn thereafter.)
  float draw = 1.0 - smoothstep(uProgress - 0.015, uProgress + 0.002, x);

  // Trail behind the plane during live flight:
  //   outbound (uDirection == +1): visible from 0 to uTrail
  //   return   (uDirection == -1): visible from (1 - uTrail) to 1
  // uTrail is 1 when the arc is fully drawn / paused, hiding the mask.
  float trailMask = 1.0;
  if (uTrail < 0.999) {
    if (uDirection > 0.0) {
      trailMask = 1.0 - smoothstep(uTrail - 0.02, uTrail + 0.02, x);
    } else {
      trailMask = smoothstep((1.0 - uTrail) - 0.02, (1.0 - uTrail) + 0.02, x);
    }
  }

  // Fade into the surface at both endpoints.
  float ends = smoothstep(0.0, 0.03, x) * (1.0 - smoothstep(0.97, 1.0, x));

  // Flowing dashes — direction sign flips the flow on the return leg.
  float d = fract(x * uDashCount - uTime * uFlow * uDirection);
  float dash = 1.0 - smoothstep(uDashSolid, uDashSolid + 0.05, d);

  // Soft limb fade: dot(surface direction, camera direction) shrinks toward
  // the visible edge of the globe; ease the alpha down across that band.
  float facing = dot(normalize(vWorld), normalize(cameraPosition));
  float limb = mix(0.35, 1.0, smoothstep(0.05, 0.45, facing));

  float alpha = uOpacity * draw * trailMask * ends * dash * limb;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
