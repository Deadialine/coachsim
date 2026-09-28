import {
  IDENTITY,
  normalize,
  multiply,
  inverse,
  vector,
  axisAngle,
} from "../hand/frames.mjs";
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function homeTargets(manifest) {
  return manifest.joints.map((j) => clamp(0, ...j.rangeRad));
}
export function validateTargets(manifest, targets) {
  if (
    !Array.isArray(targets) ||
    targets.length !== manifest.joints.length ||
    targets.some(
      (q, i) =>
        !Number.isFinite(q) ||
        q < manifest.joints[i].rangeRad[0] ||
        q > manifest.joints[i].rangeRad[1],
    )
  )
    throw Error("Provide one finite, in-range radian target per actuator.");
}
export function validateManifest(m) {
  if (
    m.schema !== "coachsim-robot-model-1" ||
    m.joints.length !== 16 ||
    m.bodies.length !== 21
  )
    throw Error("Unsupported Allegro manifest.");
  const seen = new Set(["world"]);
  for (const b of m.bodies) {
    if (seen.has(b.id) || !seen.has(b.parent))
      throw Error("Invalid body tree.");
    seen.add(b.id);
    if (
      !(b.massKg > 0) ||
      !Object.values(b.principalInertiaKgM2).every(
        (x) => Number.isFinite(x) && x > 0,
      )
    )
      throw Error("Invalid mass/inertia.");
    const I = Object.values(b.principalInertiaKgM2);
    if (Math.max(...I) > I.reduce((a, b) => a + b) - Math.max(...I) + 1e-10)
      throw Error("Nonphysical principal inertia.");
    normalize(b.rotation);
    normalize(b.bindRotation);
    normalize(b.inertiaRotation);
  }
  if (
    new Set(m.joints.map((j) => j.id)).size !== 16 ||
    new Set(m.joints.map((j) => j.body)).size !== 16
  )
    throw Error("Duplicate joint.");
  for (const j of m.joints) {
    if (
      !seen.has(j.body) ||
      !j.rangeRad.every(Number.isFinite) ||
      j.rangeRad[0] >= j.rangeRad[1] ||
      Math.abs(Math.hypot(...Object.values(j.axis)) - 1) > 1e-6 ||
      Math.hypot(...Object.values(j.position)) > 1e-10
    )
      throw Error("Invalid joint definition.");
  }
  return m;
}
// Independent hierarchical FK, used to check the import against MuJoCo fixtures.
export function forwardKinematics(m, targets) {
  validateTargets(m, targets);
  const poses = {
    world: { position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY },
  };
  for (const b of m.bodies) {
    const p = poses[b.parent],
      i = m.joints.findIndex((j) => j.body === b.id);
    const local =
      i < 0
        ? b.rotation
        : multiply(b.rotation, axisAngle(m.joints[i].axis, targets[i]));
    poses[b.id] = {
      position: add(p.position, vector(p.rotation, b.position)),
      rotation: normalize(multiply(p.rotation, local)),
    };
  }
  return poses;
}
export { IDENTITY, normalize, multiply, inverse, vector };
