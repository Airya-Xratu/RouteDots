/**
 * Soft fresnel "atmosphere" halo rendered on a slightly larger BackSide
 * sphere. Subtle enough to sit on a light hero background.
 */
import * as THREE from 'three';

export interface AtmosphereOptions {
  color?: string;
  /** How "wide" the halo is (0.6..0.8, default 0.7). */
  power?: number;
  /** Overall opacity multiplier (default 0.55). */
  intensity?: number;
  /** Halo scale relative to the globe radius (default 1.18). */
  scale?: number;
}

const VERTEX = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
void main() {
  float intensity = pow(uPower - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
  gl_FragColor = vec4(uColor, 1.0) * intensity * uIntensity;
}
`;

export function createAtmosphereMaterial(options: AtmosphereOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(options.color ?? '#8fa3bf') },
      uPower: { value: options.power ?? 0.7 },
      uIntensity: { value: options.intensity ?? 0.55 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

export function createAtmosphere(options: AtmosphereOptions = {}): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const material = createAtmosphereMaterial(options);
  const mesh = new THREE.Mesh(geometry, material);
  const scale = options.scale ?? 1.18;
  mesh.scale.setScalar(scale);
  return mesh;
}
