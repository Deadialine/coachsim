import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const manifest = await read("coach_sim/public/models/allegro/manifest.json");
const protocol = await read("scripts/backend-protocol.json");
const engines = await Promise.all(
  ["rapier", "mujoco"].map(async (name) =>
    JSON.parse(
      gunzipSync(
        await readFile(
          new URL(`evidence/backend-${name}-traces.json.gz`, root),
        ),
      ),
    ),
  ),
);
const home = manifest.joints.map((j) =>
  Math.max(j.rangeRad[0], Math.min(0, j.rangeRad[1])),
);
for (const engine of engines) {
  const expected = protocol.ratesHz.flatMap((hz) =>
    [...protocol.primitives.map((c) => c.id), ...protocol.robotCases].map(
      (id) => `${id}/${hz}`,
    ),
  );
  const keys = engine.cases.map((c) => `${c.id}/${c.hz}`);
  if (
    engine.protocol !== protocol.id ||
    new Set(keys).size !== expected.length ||
    keys.length !== expected.length ||
    expected.some((k) => !keys.includes(k))
  )
    throw Error("Incomplete or mismatched case coverage");
  for (const c of engine.cases) {
    if (c.trace.length !== Math.round(c.seconds * c.hz))
      throw Error("Incomplete trajectory");
    for (let i = 0; i < c.trace.length; i++) {
      const s = c.trace[i],
        width = c.kind === "robot" ? 16 : 3;
      if (
        Math.abs(s.timeSeconds - (i + 1) / c.hz) > 1e-8 ||
        ![s.v, c.kind === "robot" ? s.q : s.p].every(
          (v) =>
            Array.isArray(v) && v.length === width && v.every(Number.isFinite),
        )
      )
        throw Error("Malformed trajectory");
      if (
        c.kind === "robot" &&
        ![s.torque, s.command].every(
          (v) =>
            Array.isArray(v) && v.length === 16 && v.every(Number.isFinite),
        )
      )
        throw Error("Malformed actuation");
    }
  }
}
function metrics(c) {
  const end = c.trace.at(-1),
    gates = {
      finite: c.trace.every((s) =>
        Object.values(s).flat().every(Number.isFinite),
      ),
    };
  const result = {
    id: c.id,
    hz: c.hz,
    kind: c.kind,
    wallSeconds: c.wallSeconds,
    simulatedSeconds: c.seconds,
    simulationPerWallSecond: c.seconds / c.wallSeconds,
  };
  if (c.kind === "primitive") {
    result.finalPositionM = end.p;
    result.finalVelocityMS = end.v;
    if (c.id === "free-fall") {
      result.analyticPositionErrorM = Math.abs(
        end.p[2] - (0.5 - 0.5 * 9.81 * end.timeSeconds ** 2),
      );
      gates.freeFallPosition = result.analyticPositionErrorM < 0.01;
    }
    if (c.id === "rest") {
      result.heightErrorM = Math.abs(end.p[2] - 0.025);
      gates.restHeight = result.heightErrorM < 0.005;
      gates.restSpeed = Math.abs(end.v[2]) < 0.05;
    }
    if (c.id === "slide") {
      result.slideDistanceM = end.p[0];
      result.idealCoulombStopDistanceM = 1 / (2 * 0.5 * 9.81);
    }
    if (c.id === "bounce") {
      const i = c.trace.findIndex(
        (s, k) => k > 0 && c.trace[k - 1].v[2] < 0 && s.v[2] > 0,
      );
      result.firstReboundTimeSeconds = i < 0 ? null : c.trace[i].timeSeconds;
      result.postReboundPeakHeightM =
        i < 0 ? null : Math.max(...c.trace.slice(i).map((s) => s.p[2]));
      result.parametersEquivalent = false;
    }
  } else {
    result.finalAnglesRad = end.q;
    result.peakTorqueNm = Math.max(
      ...c.trace.flatMap((s) => s.torque.map(Math.abs)),
    );
    result.maxLimitPenetrationRad = Math.max(
      0,
      ...c.trace.flatMap((s) =>
        s.q.map((q, i) =>
          Math.max(
            manifest.joints[i].rangeRad[0] - q,
            q - manifest.joints[i].rangeRad[1],
          ),
        ),
      ),
    );
    gates.torqueBound = result.peakTorqueNm <= 0.15 + 1e-12;
    gates.jointLimits = result.maxLimitPenetrationRad < 0.05;
    if (c.id === "passive-zero") {
      result.maxDriftRad = Math.max(
        ...c.trace.flatMap((s) => s.q.map((q, i) => Math.abs(q - home[i]))),
      );
      gates.zeroGravityDrift = result.maxDriftRad < 1e-5;
    }
  }
  return { ...result, gates, passed: Object.values(gates).every(Boolean) };
}
function difference(a, b) {
  const field = a.kind === "robot" ? "q" : "p";
  let squares = 0,
    n = 0,
    max = 0;
  for (const s of a.trace) {
    const j = Math.round(s.timeSeconds * b.hz) - 1,
      other = b.trace[j];
    if (!other || Math.abs(other.timeSeconds - s.timeSeconds) > 1e-8)
      throw Error("Unmatched simulation timestamps");
    s[field].forEach((x, i) => {
      const d = x - other[field][i];
      squares += d * d;
      n++;
      max = Math.max(max, Math.abs(d));
    });
  }
  return {
    rmse: Math.sqrt(squares / n),
    maxAbsolute: max,
    units: field === "q" ? "rad" : "m",
    samples: n,
  };
}
const comparisons = engines[0].cases.map((a) => ({
  id: a.id,
  hz: a.hz,
  ...difference(
    a,
    engines[1].cases.find((b) => a.id === b.id && a.hz === b.hz),
  ),
}));
const sensitivity = engines.flatMap((e) =>
  e.cases
    .filter((c) => c.hz !== 480)
    .map((c) => ({
      engine: e.engine,
      id: c.id,
      hz: c.hz,
      referenceHz: 480,
      ...difference(
        c,
        e.cases.find((b) => b.id === c.id && b.hz === 480),
      ),
    })),
);
const sourceSha256 = {};
for (const path of [
  "scripts/backend-protocol.json",
  "scripts/reference_backend.py",
  "scripts/benchmark_backend_mujoco.py",
  "scripts/benchmark-backend-rapier.mjs",
  "scripts/compare-backends.mjs",
  "coach_sim/src/robot/physics.mjs",
  "coach_sim/src/robot/model.mjs",
  "coach_sim/public/models/allegro/manifest.json",
])
  sourceSha256[path] = createHash("sha256")
    .update(
      (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n"),
    )
    .digest("hex");
const summaries = engines.map((e) => ({
  engine: e.engine,
  hardware: e.hardware,
  cases: e.cases.map(metrics),
}));
const report = {
  schema: "coachsim-reference-comparison-1",
  protocol,
  sourceSha256,
  sourceCommit: manifest.sourceCommit,
  engines: summaries,
  comparisons,
  timestepSensitivity: sensitivity,
  note: "Synthetic diagnostics, not hardware validation. Bounce parameters are not equivalent. Runtime includes observation and controller work; no fair engine speed ranking is implied.",
};
await writeFile(
  new URL("evidence/backend-comparison.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
let md =
  "# Reference-backend comparison\n\nGenerated by `node scripts/compare-backends.mjs`. Full data: [comparison JSON](backend-comparison.json); all trajectories: `backend-{rapier,mujoco}-traces.json.gz`. Synthetic diagnostics only.\n\n| Engine | Case | Hz | Software gates | Wall seconds |\n| --- | --- | ---: | --- | ---: |\n";
for (const e of summaries)
  for (const c of e.cases)
    md += `| ${e.engine} | ${c.id} | ${c.hz} | ${
      c.passed
        ? "PASS"
        : Object.entries(c.gates)
            .filter(([, p]) => !p)
            .map(([k]) => k)
            .join(", ")
    } | ${c.wallSeconds.toFixed(4)} |\n`;
md +=
  "\n## Cross-engine trajectory differences\n\nRMS over all positions (m) or 16 joint angles (rad) at identical sample times. Neither engine is treated as physical truth.\n\n| Case | Hz | RMS | Maximum absolute | Units |\n| --- | ---: | ---: | ---: | --- |\n";
for (const c of comparisons)
  md += `| ${c.id} | ${c.hz} | ${c.rmse.toFixed(6)} | ${c.maxAbsolute.toFixed(6)} | ${c.units} |\n`;
md +=
  "\nBounce is a sensitivity comparison with unmatched restitution models. Timings include controller and observation overhead, exclude model loading, and are single runs on the CPUs recorded in JSON. They are not an engine performance ranking. See the [protocol and interpretation](../docs/REFERENCE_BACKEND.md).\n";
await writeFile(new URL("evidence/REFERENCE_BACKEND.md", root), md);
console.log(
  JSON.stringify(
    {
      failed: summaries.flatMap((e) =>
        e.cases
          .filter((c) => !c.passed)
          .map((c) => ({
            engine: e.engine,
            id: c.id,
            hz: c.hz,
            gates: c.gates,
          })),
      ),
      at240Hz: comparisons.filter((c) => c.hz === 240),
    },
    null,
    2,
  ),
);
