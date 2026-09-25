import { parseCSV } from "../experiment/core.mjs";
import {
  IDENTITY,
  normalize,
  multiply,
  inverse,
  vector,
  axisAngle,
  fromVectors,
} from "./frames.mjs";
export const FIELDS = ["t_us", "ax", "ay", "az", "gx", "gy", "gz"];
export const FILTER_VERSION = "coachsim-complementary-1";
export function sample(row) {
  const s = Object.fromEntries(
    FIELDS.map((k) => [
      k,
      row[k] === null ||
      typeof row[k] === "boolean" ||
      (typeof row[k] === "string" && row[k].trim() === "")
        ? NaN
        : Number(row[k]),
    ]),
  );
  if (FIELDS.some((k) => !Number.isFinite(s[k])) || s.t_us < 0)
    throw Error(
      "Each sample needs finite t_us, ax, ay, az, gx, gy, gz. Units: µs, g, °/s.",
    );
  return s;
}
export function importIMU(text) {
  if (text.length > 10_000_000) throw Error("Recording exceeds 10 MB.");
  const { headers, rows } = parseCSV(text);
  if (FIELDS.some((k) => !headers.includes(k)))
    throw Error("Required CSV columns: " + FIELDS.join(", "));
  if (rows.length < 101 || rows.length > 60000)
    throw Error(
      "Use 101–60,000 samples with at least one stationary second first.",
    );
  return rows.map(sample);
}
// Six-axis complementary filter, not VQF. Heading is relative and can drift.
export function createFilter() {
  let q = { ...IDENTITY },
    last = null,
    initial = [],
    bias = null,
    fault = null;
  return {
    push(row) {
      if (fault) throw Error(fault);
      try {
        const s = sample(row),
          dt = last === null ? 0 : (s.t_us - last) / 1e6;
        if (last !== null && (dt < 0.001 || dt > 0.05))
          throw Error(
            "Invalid timestamp or gap >50 ms. Restart with stationary calibration.",
          );
        last = s.t_us;
        const a = { x: s.ax, y: s.ay, z: s.az },
          an = Math.hypot(s.ax, s.ay, s.az);
        if (!bias) {
          initial.push(s);
          if (s.t_us - initial[0].t_us < 1e6 || initial.length < 101)
            return { t_us: s.t_us, q: null, quality: "calibrating" };
          const mean = (k) =>
            initial.reduce((n, r) => n + r[k], 0) / initial.length;
          const g = ["gx", "gy", "gz"].map(mean),
            acc = ["ax", "ay", "az"].map(mean);
          const variance = (k) =>
            initial.reduce((n, r) => n + (r[k] - mean(k)) ** 2, 0) /
            initial.length;
          if (
            Math.abs(Math.hypot(...acc) - 1) > 0.1 ||
            Math.hypot(...g) > 5 ||
            ["ax", "ay", "az"].some((k) => variance(k) > 0.0025) ||
            ["gx", "gy", "gz"].some((k) => variance(k) > 1)
          )
            throw Error(
              "Calibration requires one stationary second near 1 g and low angular velocity.",
            );
          bias = { x: g[0], y: g[1], z: g[2] };
          q = fromVectors(
            { x: acc[0], y: acc[1], z: acc[2] },
            { x: 0, y: 1, z: 0 },
          );
          initial = [];
        } else {
          const omega = {
            x: ((s.gx - bias.x) * Math.PI) / 180,
            y: ((s.gy - bias.y) * Math.PI) / 180,
            z: ((s.gz - bias.z) * Math.PI) / 180,
          };
          q = normalize(
            multiply(
              q,
              axisAngle(omega, Math.hypot(omega.x, omega.y, omega.z) * dt),
            ),
          );
          if (Math.abs(an - 1) < 0.1) {
            const measured = vector(q, a),
              axis = { x: -measured.z, y: 0, z: measured.x };
            const angle = Math.atan2(Math.hypot(axis.x, axis.z), measured.y);
            q = normalize(
              multiply(axisAngle(axis, angle * (1 - Math.exp(-dt / 0.5))), q),
            );
          }
        }
        return {
          t_us: s.t_us,
          q: { ...q },
          bias: { ...bias },
          quality:
            Math.abs(an - 1) < 0.1
              ? "tilt corrected · relative heading"
              : "gyro only · acceleration rejected",
        };
      } catch (e) {
        fault = e.message;
        throw e;
      }
    },
  };
}
export function estimate(samples) {
  const f = createFilter();
  return samples.map((s) => f.push(s));
}
export function demoSamples() {
  let q = { ...IDENTITY };
  const rows = [];
  for (let i = 0; i < 1600; i++) {
    const t = i * 0.01,
      w =
        i < 200
          ? { x: 0, y: 0, z: 0 }
          : {
              x: 35 * Math.sin((t - 2) * 0.6),
              y: 20 * Math.sin((t - 2) * 0.4),
              z: 45 * Math.sin((t - 2) * 0.3),
            };
    if (i >= 200)
      q = normalize(
        multiply(
          q,
          axisAngle(w, ((Math.hypot(w.x, w.y, w.z) * Math.PI) / 180) * 0.01),
        ),
      );
    const a = vector(inverse(q), { x: 0, y: 1, z: 0 });
    rows.push({
      t_us: i * 10000,
      ax: a.x,
      ay: a.y,
      az: a.z,
      gx: w.x,
      gy: w.y,
      gz: w.z,
    });
  }
  return rows;
}
export function lineDecoder(onSample) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    if (buffer.length > 4096 || lines.some((l) => l.length > 4096))
      throw Error("Serial line exceeds 4096 characters.");
    for (const line of lines)
      if (line.trim()) onSample(sample(JSON.parse(line)));
  };
}
