import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HIDE_BEHIND_EPS, projectPin } from '../EndpointLabels.js';
import { latLngToVec } from '../../core/greatCircle.js';

const UNIT_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

/** Inverse of projectPin: NDC → ray → unit-sphere hit (independent check). */
function unprojectToSurface(
  pr: { x: number; y: number },
  camera: THREE.PerspectiveCamera,
  w: number,
  h: number,
): THREE.Vector3 {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    // NDC: x = 2·px/w − 1, y = 1 − 2·py/h (screen y grows downward).
    new THREE.Vector2((pr.x / w) * 2 - 1, 1 - (pr.y / h) * 2),
    camera,
  );
  const hit = new THREE.Vector3();
  raycaster.ray.intersectSphere(UNIT_SPHERE, hit);
  return hit;
}

function makeCamera(position: [number, number, number] = [0, 0, 3]): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

const vec = (lat: number, lng: number) => new THREE.Vector3(...latLngToVec(lat, lng, 1));

describe('projectPin', () => {
  it('projects a point facing the camera to the centre of the viewport', () => {
    const camera = makeCamera(); // looks at the origin from (0, 0, 3)
    const pr = projectPin(vec(0, -90), camera, 800, 600);
    expect(pr.visible).toBe(true);
    expect(pr.x).toBeCloseTo(400, 4);
    expect(pr.y).toBeCloseTo(300, 4);
  });

  it('hides points on the far hemisphere', () => {
    const camera = makeCamera();
    expect(projectPin(vec(0, 90), camera, 800, 600).visible).toBe(false);
    expect(projectPin(vec(0, 0), camera, 800, 600).visible).toBe(false);
  });

  it('keeps near-horizon points within a margin of HIDE_BEHIND_EPS', () => {
    const camera = makeCamera();
    // Point 80° away from the camera direction: clearly visible…
    const far = projectPin(vec(0, -170), camera, 800, 600);
    expect(far.visible).toBe(true);
    // …while one ~88° away is just past the limb and hidden.
    const edge = projectPin(vec(0, -178), camera, 800, 600);
    expect(edge.visible).toBe(false);
    expect(HIDE_BEHIND_EPS).toBeGreaterThan(0);
  });

  it('moves the screen position as the camera orbits', () => {
    const a = projectPin(vec(0, -90), makeCamera([0, 0, 3]), 800, 600);
    // Camera swings 30° of longitude around the globe: the point shifts left.
    const b = projectPin(vec(0, -90), makeCamera([1.5, 0, 2.6]), 800, 600);
    expect(a.x).toBeCloseTo(400, 4);
    expect(b.x).toBeLessThan(a.x); // point slides to the left of centre
    expect(b.y).toBeCloseTo(300, 4); // both positions stay on the equator line
  });

  it('accounts for camera orientation, not just position', () => {
    // Camera high in the northern hemisphere, looking at the origin: the
    // surface point directly beneath it must project to the centre, even
    // though the camera is rotated away from the +Z axis.
    const camera = makeCamera([0, 2, 2.45]);
    camera.lookAt(0, 0, 0);
    const facing = new THREE.Vector3(0, 2, 2.45).normalize();
    const pr = projectPin(facing, camera, 800, 600);
    expect(pr.visible).toBe(true);
    expect(pr.x).toBeCloseTo(400, 4);
    expect(pr.y).toBeCloseTo(300, 4);
  });

  it('round-trips off-centre points through an independent ray test', () => {
    // project → Raycaster → unit-sphere intersection must land back on the
    // original surface point. This catches homogeneous-division errors that
    // only show up away from the viewport centre.
    const camera = makeCamera([0, 0, 3]);
    const spot = vec(25, -60); // well off-centre, still on the near hemisphere
    const pr = projectPin(spot, camera, 800, 600);
    expect(pr.visible).toBe(true);
    const hit = unprojectToSurface(pr, camera, 800, 600);
    expect(hit.distanceTo(spot)).toBeLessThan(0.002);

    // Same for a rotated camera and a different viewport size.
    const camera2 = makeCamera([1.2, 1.5, 2.2]);
    const spot2 = vec(10, -100);
    const pr2 = projectPin(spot2, camera2, 1024, 768);
    expect(pr2.visible).toBe(true);
    const hit2 = unprojectToSurface(pr2, camera2, 1024, 768);
    expect(hit2.distanceTo(spot2)).toBeLessThan(0.002);
  });

  it('scales the position with the viewport size', () => {
    const camera = makeCamera();
    const small = projectPin(vec(0, -90), camera, 400, 300);
    const big = projectPin(vec(0, -90), camera, 1600, 1200);
    expect(big.x).toBeCloseTo(small.x * 4, 4);
    expect(big.y).toBeCloseTo(small.y * 4, 4);
  });
});
