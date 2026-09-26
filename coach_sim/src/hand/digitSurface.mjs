import * as THREE from "three";
import { blendDual, skinTransform, transformPoint } from "./skinning.mjs";
// A continuous closed display mesh. No vertices participate in collision response.
export function createDigitSurface(links) {
  const bodies = [...links.map((l) => l.body), links[0].parent];
  const bind = bodies.map((body) => ({
    position: { ...body.translation() },
    rotation: { ...body.rotation() },
  }));
  const lengths = links.map((l) => l.shape.length),
    total = lengths.reduce((a, b) => a + b, 0);
  const direction = links[0].shape.offset
    ? new THREE.Vector3(
        links[0].shape.offset.x,
        links[0].shape.offset.y,
        0,
      ).normalize()
    : new THREE.Vector3(0, 1, 0);
  const lateral = new THREE.Vector3(direction.y, -direction.x, 0);
  const dorsal = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion(
    ...["x", "y", "z", "w"].map((k) => bind[0].rotation[k]),
  );
  const origin = new THREE.Vector3(
    ...["x", "y", "z"].map((k) => bind[0].position[k]),
  );
  const rings = 49,
    sides = 24,
    rest = [],
    weights = [],
    indices = [];
  const start = -links[0].shape.radius,
    end = total + 0.003;
  const radiusAt = (s) => {
    const t = Math.max(0, s / end);
    const base = links[0].shape.radius * 1.13;
    const taper = 1 - 0.27 * t;
    const tip = Math.sqrt(
      Math.max(0.008, 1 - Math.max(0, (t - 0.9) / 0.1) ** 2),
    );
    return base * taper * tip;
  };
  for (let r = 0; r < rings; r++) {
    const s = start + ((end - start) * r) / (rings - 1),
      w = [0, 0, 0, 0];
    let segment = s < lengths[0] ? 0 : s < lengths[0] + lengths[1] ? 1 : 2;
    w[segment] = 1;
    const rootWidth = links[0].shape.radius;
    if (s < rootWidth) {
      const u = Math.max(0, (s + rootWidth) / (2 * rootWidth)),
        t = u * u * (3 - 2 * u);
      w[0] = t;
      w[3] = 1 - t;
    }
    for (let joint = 1; joint < 3; joint++) {
      const at = lengths.slice(0, joint).reduce((a, b) => a + b, 0),
        width = links[joint].shape.radius * 1.2;
      if (Math.abs(s - at) < width) {
        const u = (s - at + width) / (2 * width),
          t = u * u * (3 - 2 * u);
        w.fill(0);
        w[joint - 1] = 1 - t;
        w[joint] = t;
      }
    }
    weights.push(w);
    for (let c = 0; c < sides; c++) {
      const theta = (c / sides) * Math.PI * 2,
        radius = radiusAt(s);
      const p = direction
        .clone()
        .multiplyScalar(s)
        .addScaledVector(lateral, Math.cos(theta) * radius)
        .addScaledVector(
          dorsal,
          Math.sin(theta) * radius * (Math.sin(theta) < 0 ? 1.1 : 0.85),
        );
      p.applyQuaternion(q).add(origin);
      rest.push(p);
      if (r < rings - 1) {
        const a = r * sides + c,
          b = r * sides + ((c + 1) % sides);
        indices.push(a, b + sides, b, a, a + sides, b + sides);
      }
    }
  }
  // Separate centers close the tube with real triangles, avoiding zero-area tip rings.
  for (const cap of [0, 1]) {
    const center = direction
      .clone()
      .multiplyScalar(cap ? end : start)
      .applyQuaternion(q)
      .add(origin);
    const index = rest.length;
    rest.push(center);
    const row = cap ? rings - 1 : 0;
    for (let c = 0; c < sides; c++) {
      const a = row * sides + c,
        b = row * sides + ((c + 1) % sides);
      indices.push(...(cap ? [index, b, a] : [index, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(rest.length * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  function update(poses) {
    const transforms = bind.map((b, i) => skinTransform(b, poses[i]));
    for (let r = 0; r < rings; r++) {
      const t = blendDual(transforms, weights[r]);
      for (let c = 0; c < sides; c++) {
        const i = r * sides + c,
          p = transformPoint(t, rest[i]);
        positions.set([p.x, p.y, p.z], i * 3);
      }
    }
    for (const end of [0, 1]) {
      const i = rings * sides + end,
        p = transformPoint(transforms[end ? 2 : 3], rest[i]);
      positions.set([p.x, p.y, p.z], i * 3);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  update(bind);
  return { geometry, update, bind, rest, bodies };
}
