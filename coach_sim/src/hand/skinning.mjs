import { normalize, multiply, inverse, vector } from "./frames.mjs";
const keys = ["x", "y", "z", "w"];
const dot = (a, b) => keys.reduce((s, k) => s + a[k] * b[k], 0);
// Kavan et al. 2007: rigid transform represented by real and dual parts.
export function dualTransform(rotation, translation) {
  const real = normalize(rotation);
  const product = multiply({ ...translation, w: 0 }, real);
  return {
    real,
    dual: Object.fromEntries(keys.map((k) => [k, product[k] * 0.5])),
  };
}
export function blendDual(transforms, weights) {
  const reference = transforms[weights.findIndex((w) => w > 0)]?.real;
  if (!reference || weights.some((w) => !Number.isFinite(w) || w < 0))
    throw Error("Invalid skin weights.");
  const real = { x: 0, y: 0, z: 0, w: 0 },
    dual = { ...real };
  transforms.forEach((t, i) => {
    const w = weights[i] * (dot(reference, t.real) < 0 ? -1 : 1);
    for (const k of keys) {
      real[k] += w * t.real[k];
      dual[k] += w * t.dual[k];
    }
  });
  const length = Math.sqrt(dot(real, real));
  if (length < 1e-9) throw Error("Degenerate skin transform.");
  for (const k of keys) {
    real[k] /= length;
    dual[k] /= length;
  }
  const projection = dot(real, dual);
  for (const k of keys) dual[k] -= real[k] * projection;
  return { real, dual };
}
export function transformPoint(transform, point) {
  const p = vector(transform.real, point);
  const t = multiply(transform.dual, inverse(transform.real));
  return { x: p.x + 2 * t.x, y: p.y + 2 * t.y, z: p.z + 2 * t.z };
}
export function skinTransform(bind, current) {
  const q = normalize(multiply(current.rotation, inverse(bind.rotation)));
  const p = vector(q, bind.position);
  return dualTransform(q, {
    x: current.position.x - p.x,
    y: current.position.y - p.y,
    z: current.position.z - p.z,
  });
}
