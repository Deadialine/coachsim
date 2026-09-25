import test from "node:test";
import assert from "node:assert/strict";
import {
  initPhysics,
  createHand,
  DEFAULT_CONTROLS,
} from "../src/hand/physics.mjs";
import {
  PLACEMENTS,
  fromEuler,
  vector,
  inverse,
  multiply,
  IDENTITY,
} from "../src/hand/frames.mjs";
import {
  demoSamples,
  estimate,
  importIMU,
  lineDecoder,
  createFilter,
  sample,
} from "../src/hand/imu.mjs";
await initPhysics();
test("placement frames preserve connected joints across 27 directions under gravity", () => {
  let gap = 0,
    limit = 0;
  for (const roll of [-180, 0, 70])
    for (const pitch of [-90, 0, 55])
      for (const yaw of [-90, 0, 120]) {
        const h = createHand({
          baseOrientation: fromEuler({ roll, pitch, yaw }),
          basePosition: { x: 0, y: 0, z: 0 },
          floorY: -0.6,
        });
        try {
          assert.ok(h.diagnostics().separationMm < 0.001);
          for (let i = 0; i < 240; i++) {
            h.step({
              ...DEFAULT_CONTROLS,
              flex: 35,
              deviation: -20,
              rotation: 40,
              cup: 1,
              index: 0.6,
              middle: 0.6,
              ring: 0.6,
              little: 0.6,
              thumb: 0.4,
              opposition: 45,
            });
            const d = h.diagnostics();
            gap = Math.max(gap, d.separationMm);
            limit = Math.max(limit, d.limitErrorDeg);
            assert.ok(Number.isFinite(d.trackingDeg));
            assert.ok(d.separationMm < 0.5);
            assert.ok(d.limitErrorDeg < 1);
          }
        } finally {
          h.dispose();
        }
      }
  console.log(
    JSON.stringify({ directions: 27, maxAnchorMm: gap, maxLimitDeg: limit }),
  );
});
test("gravity-free movement is invariant to global placement rotation", () => {
  const a = createHand({ floorY: -2 }),
    q = fromEuler(PLACEMENTS.oblique),
    b = createHand({ baseOrientation: q, floorY: -2 });
  try {
    for (let i = 0; i < 180; i++) {
      for (const h of [a, b])
        h.step({
          ...DEFAULT_CONTROLS,
          gravity: false,
          flex: 25,
          index: 0.5,
          cup: 0.8,
        });
    }
    for (const [key, value] of Object.entries(a.diagnostics().angles))
      assert.ok(Math.abs(value - b.diagnostics().angles[key]) < 0.15, key);
  } finally {
    a.dispose();
    b.dispose();
  }
});
test("observed orientation preserves articulation and palm position without simulation steps", () => {
  const h = createHand();
  try {
    for (let i = 0; i < 120; i++) h.step({ ...DEFAULT_CONTROLS, index: 0.5 });
    const before = h.diagnostics(),
      p = { ...h.bodies.deviation.translation() };
    for (const angles of Object.values(PLACEMENTS)) {
      const q = fromEuler(angles);
      h.setObservedPalmOrientation(q);
      const d = h.diagnostics();
      assert.equal(d.steps, before.steps);
      assert.ok(d.separationMm < 0.01);
      assert.deepEqual({ ...h.bodies.deviation.translation() }, p);
      for (const k of Object.keys(q))
        assert.ok(Math.abs(d.palmOrientation[k] - q[k]) < 1e-6);
      for (const k of Object.keys(before.angles))
        assert.ok(Math.abs(d.angles[k] - before.angles[k]) < 0.001);
    }
  } finally {
    h.dispose();
  }
});
test("six-axis filter calibrates, tracks synthetic rotations and rejects bad timing and motion", () => {
  const rows = demoSamples(),
    out = estimate(rows);
  assert.equal(out[99].q, null);
  assert.ok(out[100].q);
  assert.ok(
    out.every(
      (r) => !r.q || Math.abs(Math.hypot(...Object.values(r.q)) - 1) < 1e-10,
    ),
  );
  // Independent integral of input angular velocity is the synthetic ground truth.
  let q = IDENTITY;
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    if (i >= 200) {
      const n = Math.hypot(s.gx, s.gy, s.gz),
        a = ((n * Math.PI) / 180) * 0.01,
        k = n ? Math.sin(a / 2) / n : 0;
      q = multiply(q, {
        x: s.gx * k,
        y: s.gy * k,
        z: s.gz * k,
        w: Math.cos(a / 2),
      });
    }
    if (out[i].q) {
      const dot = Math.abs(
        Object.keys(q).reduce((n, k) => n + q[k] * out[i].q[k], 0),
      );
      assert.ok((2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI < 0.001);
    }
  }
  assert.throws(
    () => estimate([...rows.slice(0, 110), { ...rows[110], t_us: 3e6 }]),
    /gap/,
  );
  assert.throws(
    () => estimate(rows.slice(0, 102).map((r) => ({ ...r, gx: 20 }))),
    /stationary/,
  );
  const f = createFilter();
  f.push(rows[0]);
  assert.throws(() => f.push(rows[0]), /timestamp/);
  assert.throws(() => f.push(rows[1]), /timestamp/);
});
test("IMU parser handles serial chunks and validates CSV numeric fields", () => {
  const source=demoSamples(),fields=["t_us","ax","ay","az","gx","gy","gz"];
  assert.deepEqual(importIMU([fields.join(","),...source.map(r=>fields.map(k=>r[k]).join(","))].join("\n")),source);
  const received = [],
    consume = lineDecoder((s) => received.push(s)),
    row = demoSamples()[0],
    text = JSON.stringify(row) + "\n";
  consume(text.slice(0, 7));
  consume(text.slice(7));
  assert.deepEqual(received, [row]);
  assert.throws(() => consume("x".repeat(4097)), /4096/);
  assert.throws(
    () => importIMU("t_us,ax,ay,az,gx,gy,gz\n0,0,1,0,0,0,0"),
    /101/,
  );
});

test("stationary initialization works in inverted and oblique frames and recovers constant bias", () => {
  for (const angles of Object.values(PLACEMENTS)) {
    const a = vector(inverse(fromEuler(angles)), { x: 0, y: 1, z: 0 });
    const f = createFilter();
    let result;
    for (let i = 0; i < 250; i++)
      result = f.push({
        t_us: i * 10000,
        ax: a.x,
        ay: a.y,
        az: a.z,
        gx: 0.3,
        gy: -0.2,
        gz: 0.1,
      });
    const up = vector(result.q, a);
    assert.ok(Math.abs(up.y - 1) < 1e-8);
    assert.ok(Math.abs(result.bias.x - 0.3) < 1e-8);
  }
  assert.throws(
    () => sample({ t_us: 0, ax: null, ay: 1, az: 0, gx: 0, gy: 0, gz: 0 }),
    /finite/,
  );
  const f = createFilter();
  const rows = demoSamples();
  for (const row of rows.slice(0, 101)) f.push(row);
  assert.match(f.push({ ...rows[101], ay: 2 }).quality, /gyro only/);
});
