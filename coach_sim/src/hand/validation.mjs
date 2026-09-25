import { parseCSV } from "../experiment/core.mjs";
import {
  normalize,
  multiply,
  inverse,
  vector,
  axisAngle,
  IDENTITY,
} from "./frames.mjs";
import { demoSamples, estimate } from "./imu.mjs";
const clamp = (x) => Math.max(-1, Math.min(1, x));
export function angularError(a, b) {
  const qa = normalize(a),
    qb = normalize(b);
  return (
    (2 *
      Math.acos(
        clamp(Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w)),
      ) *
      180) /
    Math.PI
  );
}
export function slerp(a, b, t) {
  a = normalize(a);
  b = normalize(b);
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) {
    b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    dot = -dot;
  }
  let u = 1 - t,
    v = t;
  if (dot < 0.9995) {
    const angle = Math.acos(clamp(dot)),
      s = Math.sin(angle);
    u = Math.sin((1 - t) * angle) / s;
    v = Math.sin(t * angle) / s;
  }
  return normalize(
    Object.fromEntries(
      ["x", "y", "z", "w"].map((k) => [k, a[k] * u + b[k] * v]),
    ),
  );
}
export function referenceCSV(text) {
  if (text.length > 10_000_000) throw Error("Reference exceeds 10 MB.");
  const { headers, rows } = parseCSV(text),
    keys = ["t_us", "qx", "qy", "qz", "qw"];
  if (keys.some((k) => !headers.includes(k)))
    throw Error("Reference CSV needs t_us,qx,qy,qz,qw.");
  if (rows.length < 2 || rows.length > 60000)
    throw Error("Reference needs 2–60,000 samples.");
  return validateRows(
    rows.map((r) => {
      if (keys.some((k) => !r[k].trim())) throw Error("Empty reference value.");
      return {
        t_us: Number(r.t_us),
        q: {
          x: Number(r.qx),
          y: Number(r.qy),
          z: Number(r.qz),
          w: Number(r.qw),
        },
      };
    }),
  );
}
function validateRows(rows) {
  let previous = -Infinity;
  return rows.map((r) => {
    if (!Number.isFinite(r.t_us) || r.t_us < 0 || r.t_us <= previous)
      throw Error(
        "Reference timestamps must be finite, nonnegative and strictly increasing.",
      );
    previous = r.t_us;
    return { t_us: r.t_us, q: normalize(r.q) };
  });
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    rmse: Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
    max: sorted.at(-1),
  };
}
export function compareOrientations(
  estimates,
  reference,
  { offsetUs = 0, maxGapUs = 50000 } = {},
) {
  if (!Number.isFinite(offsetUs) || !Number.isFinite(maxGapUs) || maxGapUs <= 0)
    throw Error("Invalid alignment settings.");
  const source = estimates.filter((e) => e.q),
    input = validateRows(source),
    ref = validateRows(reference);
  if (!input.length || ref.length < 2)
    throw Error(
      "Load orientation estimates and at least two reference samples.",
    );
  let j = 0;
  const rows = [];
  for (const e of input) {
    const t = e.t_us + offsetUs;
    if (t < ref[0].t_us || t > ref.at(-1).t_us) continue;
    while (j + 1 < ref.length && ref[j + 1].t_us <= t) j++;
    let truth = ref[j].q;
    if (t !== ref[j].t_us) {
      if (j + 1 >= ref.length || ref[j + 1].t_us - ref[j].t_us > maxGapUs)
        continue;
      truth = slerp(
        ref[j].q,
        ref[j + 1].q,
        (t - ref[j].t_us) / (ref[j + 1].t_us - ref[j].t_us),
      );
    }
    const ae = vector(inverse(e.q), { x: 0, y: 1, z: 0 }),
      ar = vector(inverse(truth), { x: 0, y: 1, z: 0 });
    rows.push({
      t_us: e.t_us,
      reference_t_us: t,
      orientationDeg: angularError(e.q, truth),
      tiltDeg:
        (Math.acos(clamp(ae.x * ar.x + ae.y * ar.y + ae.z * ar.z)) * 180) /
        Math.PI,
    });
  }
  if (!rows.length)
    throw Error(
      "No supported time overlap. Check the offset and reference gaps.",
    );
  return {
    schema: "coachsim-orientation-comparison-1",
    offsetUs,
    maxGapUs,
    estimatedSamples: input.length,
    calibrationSamplesExcluded: estimates.length - input.length,
    matchedSamples: rows.length,
    coverage: rows.length / input.length,
    orientationDeg: stats(rows.map((r) => r.orientationDeg)),
    tiltDeg: stats(rows.map((r) => r.tiltDeg)),
    rows,
  };
}
export function validationDemo() {
  const clean = demoSamples();
  let q = { ...IDENTITY };
  const reference = [];
  clean.forEach((s, i) => {
    if (i >= 200) {
      const w = { x: s.gx, y: s.gy, z: s.gz };
      q = normalize(
        multiply(
          q,
          axisAngle(w, ((Math.hypot(w.x, w.y, w.z) * Math.PI) / 180) * 0.01),
        ),
      );
    }
    reference.push({ t_us: s.t_us, q: { ...q } });
  });
  const noisy = clean.map((s, i) => ({
    ...s,
    ax: s.ax + 0.008 * Math.sin(i * 0.7) + (i > 800 && i < 900 ? 0.35 : 0),
    ay: s.ay + 0.008 * Math.sin(i * 0.9),
    az: s.az + 0.008 * Math.cos(i * 0.6),
    gx: s.gx + 0.3 + 0.15 * Math.sin(i * 0.3),
    gy: s.gy - 0.2 + (i > 900 ? 0.5 : 0),
    gz: s.gz + 0.1 + 0.15 * Math.cos(i * 0.4),
  }));
  return {
    estimates: estimate(noisy),
    reference,
    raw: noisy,
    provenance:
      "synthetic noise, acceleration pulse and bias-drift demonstration",
  };
}
