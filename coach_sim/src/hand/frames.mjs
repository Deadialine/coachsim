export const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
export function normalize(q) {
  if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite))
    throw new Error("Quaternion must contain four finite numbers.");
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (n < 1e-9) throw new Error("Quaternion must have nonzero length.");
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
export const inverse = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const multiply = (a, b) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export function vector(q, p) {
  const r = multiply(multiply(q, { ...p, w: 0 }), inverse(q));
  return { x: r.x, y: r.y, z: r.z };
}
export function axisAngle(axis, angle) {
  const n = Math.hypot(axis.x, axis.y, axis.z);
  if (n < 1e-12) return { ...IDENTITY };
  const s = Math.sin(angle / 2) / n;
  return {
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: Math.cos(angle / 2),
  };
}
// Active local-to-world rotation: Rz(yaw) Ry(pitch) Rx(roll), degrees.
export function fromEuler({ roll = 0, pitch = 0, yaw = 0 } = {}) {
  if (![roll, pitch, yaw].every(Number.isFinite))
    throw new Error("Placement angles must be finite.");
  const r = Math.PI / 180;
  return normalize(
    multiply(
      multiply(
        axisAngle({ x: 0, y: 0, z: 1 }, yaw * r),
        axisAngle({ x: 0, y: 1, z: 0 }, pitch * r),
      ),
      axisAngle({ x: 1, y: 0, z: 0 }, roll * r),
    ),
  );
}
export function fromVectors(a, b) {
  const n = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z),
    dot = a.x * b.x + a.y * b.y + a.z * b.z;
  if (n < 1e-9) throw new Error("Cannot align a zero vector.");
  if (dot / n < -0.999999) {
    const helper =
      Math.abs(a.x) < Math.abs(a.z)
        ? { x: 1, y: 0, z: 0 }
        : { x: 0, y: 0, z: 1 };
    return axisAngle(
      {
        x: a.y * helper.z - a.z * helper.y,
        y: a.z * helper.x - a.x * helper.z,
        z: a.x * helper.y - a.y * helper.x,
      },
      Math.PI,
    );
  }
  return normalize({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
    w: n + dot,
  });
}
export const PLACEMENTS = {
  upright: { roll: 0, pitch: 0, yaw: 0 },
  inverted: { roll: 180, pitch: 0, yaw: 0 },
  horizontal: { roll: 0, pitch: 0, yaw: 90 },
  palm_up: { roll: -90, pitch: 0, yaw: 0 },
  oblique: { roll: 55, pitch: 35, yaw: -40 },
};
