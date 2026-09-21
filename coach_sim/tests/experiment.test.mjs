import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  CLASSES,
  CONFIG,
  schedule,
  newSession,
  appendSimulation,
  displayPrediction,
  signalQualityAt,
  atTime,
  bundleFiles,
  readBundleFiles,
  validateBundle,
  qualitySummary,
  migrateV1,
  V1_HEADER,
  toCSV,
  parseCSV,
} from "../src/experiment/core.mjs";
test("raw quality overrides a confident overlay", () => {
  const b = newSession();
  appendSimulation(b, 1e6, schedule());
  assert.equal(signalQualityAt(b, 1e6), true);
  b.emg.at(-1).adc_flags = 1;
  assert.equal(signalQualityAt(b, 1e6), false);
  b.emg.at(-1).adc_flags = 0;
  b.imu.at(-1).sensor_flags = 1;
  assert.equal(signalQualityAt(b, 1e6), false);
});
test("seeded cue order has exactly eight trials per class and 336 seconds", () => {
  const e = schedule();
  assert.deepEqual(e, schedule());
  assert.notDeepEqual(e, schedule(5));
  for (const c of CLASSES)
    assert.equal(
      e.filter((r) => r.event_type === "cue" && r.target_posture === c).length,
      8,
    );
  assert.equal(e.at(-1).t_us, 336e6);
  for (let i = 1; i < e.length; i++)
    assert.equal(e[i].t_us - e[i - 1].t_us, 3e6);
});
test("simulation is invariant to render chunk size, full-resolution rates and ZIP roundtrip", () => {
  const a = newSession({ now: 0 }),
    b = newSession({ now: 0 }),
    p = schedule();
  appendSimulation(a, 1000000, p);
  for (let i = 1; i <= 10; i++) appendSimulation(b, i * 100000, p);
  assert.deepEqual(a, b);
  assert.equal(a.emg.length, 2000);
  assert.equal(a.imu.length, 100);
  assert.equal(a.predictions.length, 20);
  const files = bundleFiles(a);
  const z = zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  );
  const read = readBundleFiles(
    Object.fromEntries(
      Object.entries(unzipSync(z)).map(([k, v]) => [k, strFromU8(v)]),
    ),
  );
  assert.deepEqual(read, a);
});
test("rejects invalid, missing, duplicate, reversed and future rows", () => {
  const base = newSession();
  appendSimulation(base, 1e5, schedule());
  for (const mutate of [
    (b) => (b.emg[1].t_us = 0),
    (b) => (b.imu[0].ax = NaN),
    (b) => (b.emg[0].emg_ch1 = 5000),
    (b) => (b.session.provenance = "unknown"),
    (b) => (b.predictions[0].confidence = 2),
    (b) => (b.emg[0].t_us = -1),
    (b) => (b.imu[1].sample_index = 0),
    (b) => (b.events[0].target_posture = "bad"),
    (b) => (b.emg[0].t_us = 2e5),
  ]) {
    const b = structuredClone(base);
    mutate(b);
    assert.throws(() => validateBundle(b));
  }
  const files = bundleFiles(base);
  files["emg.csv"] = files["emg.csv"].replace("0,0,", "0,,");
  assert.throws(() => readBundleFiles(files));
});
test("gates quality, confidence, stale and future predictions and resets stability", () => {
  const p = {
    t_us: 1000000,
    predicted_posture: CLASSES[1],
    confidence: 0.9,
    quality_ok: 1,
  };
  let state = displayPrediction(p, 1e6);
  assert.equal(state.stable, false);
  state = displayPrediction({ ...p, t_us: 1250000 }, 1250000, state);
  assert.equal(state.stable, true);
  for (const [pred, t] of [
    [{ ...p, confidence: 0.5 }, 1e6],
    [{ ...p, quality_ok: 0 }, 1e6],
    [p, 1300000],
    [p, 999999],
  ])
    assert.equal(displayPrediction(pred, t, state).label, "uncertain");
  assert.equal(
    displayPrediction(
      { ...p, predicted_posture: CLASSES[2], t_us: 1250000 },
      1250000,
      state,
    ).stable,
    false,
  );
});
test("loss includes leading/trailing missing rows and clipping is counted", () => {
  const b = newSession();
  appendSimulation(b, 1e5, schedule(), { fault: true });
  const q = qualitySummary(b.emg.slice(2, -2), 2000, 1e5, true);
  assert.equal(q.missing_fraction, 0.02);
  assert.equal(q.clipped_fraction, 1);
});
test("legacy v1 keeps IMU timestamps and never invents raw EMG", () => {
  const text =
    V1_HEADER +
    "\n1,0,1000000,0,0,0,1,0,0,0,0,0,0,0,0,0\n1,1,1010000,0,0,0,1,0,0,0,0,0,0,0,0,0\n";
  const b = migrateV1(text);
  assert.equal(b.emg.length, 0);
  assert.equal(b.imu[0].t_us, 0);
  assert.equal(b.imu[1].t_us, 10000);
  assert.equal(b.session.provenance, "legacy_unverified");
  assert.throws(() => migrateV1(text.replace("schema_version", "version")));
});
test("CSV handles quotes and multiline content and rejects ragged rows", () => {
  const row = { a: 'a,"b"\nc', b: "plain" };
  assert.deepEqual(parseCSV(toCSV([row], ["a", "b"])).rows, [row]);
  assert.throws(() => parseCSV("a,b\n1\n"));
  assert.equal(atTime([{ t_us: 100 }], 99), null);
});
