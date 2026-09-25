import test from "node:test";
import assert from "node:assert/strict";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
} from "../src/hand/physics.mjs";
import { createTrial } from "../src/hand/trials.mjs";
import {
  angularError,
  slerp,
  compareOrientations,
  referenceCSV,
  validationDemo,
} from "../src/hand/validation.mjs";
import { IDENTITY, fromEuler } from "../src/hand/frames.mjs";
await initPhysics();
const setup = {
  baseOrientation: fromEuler({ roll: 55, pitch: 35, yaw: -40 }),
  basePosition: { x: 0, y: 0, z: 0 },
  floorY: -0.6,
};
function run(scenario, frameSeconds) {
  const h = createHand(setup);
  try {
    const runner = createTrial(h, {
      scenario,
      setup,
      controls: DEFAULT_CONTROLS,
    });
    while (!runner.complete) runner.advance(frameSeconds);
    return runner.report(true);
  } finally {
    h.dispose();
  }
}
test("motion trials have fixed sampling and reproduce across rendering frame rates", () => {
  const a = run("postures", 1 / 30),
    b = run("postures", 1 / 60);
  assert.equal(a.rows.length, 1680);
  assert.equal(new Set(a.rows.map((r) => r.phase)).size, 7);
  assert.deepEqual(a.rows, b.rows);
  assert.equal(a.complete, true);
  assert.ok(a.summary.maxAnchorMm < 0.5);
  assert.ok(a.summary.maxLimitDeg < 1);
});
test("palm perturbation is recorded exactly once with a specified impulse and solver time", () => {
  const r = run("recovery", 1 / 60);
  assert.equal(r.rows.length, 720);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].t_s, 3);
  const i = r.events[0].impulseWorldNs;
  assert.ok(Math.abs(Math.hypot(i.x, i.y, i.z) - 0.02) < 1e-7);
  assert.ok(
    Math.abs(r.rows[360].angles.flex - r.rows[359].angles.flex) > 0.001,
  );
  assert.ok(r.summary.maxAnchorMm < 0.5);
  assert.ok(r.summary.maxLimitDeg < 1);
});
test("observation uses a fixed reference pose without accumulating transform errors", () => {
  const h = createHand(setup);
  try {
    h.setObservedPalmOrientation(IDENTITY);
    const start = h.links.map((l) => ({ ...l.body.translation() }));
    for (let i = 0; i < 2000; i++)
      h.setObservedPalmOrientation(
        fromEuler({ roll: i % 360, pitch: i % 170, yaw: i % 90 }),
      );
    h.setObservedPalmOrientation(IDENTITY);
    assert.deepEqual(
      h.links.map((l) => ({ ...l.body.translation() })),
      start,
    );
  } finally {
    h.dispose();
  }
});
test("orientation metrics handle signs, known yaw errors, tilt and quaternion interpolation", () => {
  const yaw = fromEuler({ pitch: 30 }),
    tilt = fromEuler({ roll: 20 });
  assert.ok(Math.abs(angularError(IDENTITY, yaw) - 30) < 1e-8);
  assert.ok(
    angularError(
      yaw,
      Object.fromEntries(Object.entries(yaw).map(([k, v]) => [k, -v])),
    ) < 1e-5,
  );
  assert.ok(
    Math.abs(angularError(IDENTITY, slerp(IDENTITY, yaw, 0.5)) - 15) < 1e-8,
  );
  const reference = [
    { t_us: 0, q: IDENTITY },
    { t_us: 10000, q: IDENTITY },
  ];
  let r = compareOrientations([{ t_us: 5000, q: yaw }], reference);
  assert.ok(Math.abs(r.orientationDeg.rmse - 30) < 1e-8);
  assert.ok(r.tiltDeg.rmse < 1e-6);
  r = compareOrientations([{ t_us: 5000, q: tilt }], reference);
  assert.ok(Math.abs(r.tiltDeg.rmse - 20) < 1e-8);
});
test("reference alignment excludes gaps and extrapolation and reports coverage honestly", () => {
  const reference = [
    { t_us: 10000, q: IDENTITY },
    { t_us: 20000, q: IDENTITY },
    { t_us: 100000, q: IDENTITY },
  ];
  const estimates = [
    { t_us: 0, q: null },
    { t_us: 0, q: IDENTITY },
    { t_us: 5000, q: IDENTITY },
    { t_us: 40000, q: IDENTITY },
    { t_us: 100000, q: IDENTITY },
  ];
  const r = compareOrientations(estimates, reference, { offsetUs: 10000 });
  assert.equal(r.matchedSamples, 2);
  assert.equal(r.coverage, 0.5);
  assert.equal(r.calibrationSamplesExcluded, 1);
  assert.throws(
    () => compareOrientations(estimates, reference, { offsetUs: 2e6 }),
    /overlap/,
  );
  assert.throws(
    () => referenceCSV("t_us,qx,qy,qz,qw\n0,0,0,0,0\n10000,0,0,0,1"),
    /nonzero/,
  );
  assert.throws(
    () => referenceCSV("t_us,qx,qy,qz,qw\n0,0,0,0,1\n0,0,0,0,1"),
    /increasing/,
  );
  const parsed = referenceCSV("t_us,qx,qy,qz,qw\n0,0,0,0,1\n10000,0,0,0,1");
  assert.equal(parsed.length, 2);
});
test("noisy synthetic benchmark yields finite nonzero errors and complete time coverage", () => {
  const d = validationDemo(),
    r = compareOrientations(d.estimates, d.reference);
  assert.equal(r.coverage, 1);
  assert.equal(r.calibrationSamplesExcluded, 100);
  assert.ok(r.orientationDeg.rmse > 0.01);
  assert.ok(r.orientationDeg.max < 30);
  console.log(
    JSON.stringify({
      syntheticOrientation: r.orientationDeg,
      syntheticTilt: r.tiltDeg,
    }),
  );
});
