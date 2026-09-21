import test from "node:test";
import assert from "node:assert/strict";
import {
  newSession,
  appendSimulation,
  schedule,
  bundleFiles,
  readBundleFiles,
  toCSV,
  parseCSV,
} from "../src/experiment/core.mjs";
import {
  coachingDecision,
  normalizeLayout,
  DEFAULT_LAYOUT,
  addOperatorNote,
} from "../src/experiment/workspace.mjs";

test("coaching withholds feedback on failed gates and does not praise a mismatched posture", () => {
  const input = {
    prediction: { t_us: 900000, quality_ok: 1, confidence: 0.87 },
    status: { label: "wrist_flexion", stable: true },
    target: "wrist_flexion",
    eventType: "cue",
    qualityOk: true,
    t: 1000000,
  };
  assert.equal(coachingDecision(input).state, "HOLD");
  assert.equal(
    coachingDecision({ ...input, target: "wrist_extension" }).state,
    "ADJUST",
  );
  assert.equal(coachingDecision({ ...input, eventType: "rest" }).state, "REST");
  assert.equal(
    coachingDecision({
      ...input,
      status: { label: "wrist_flexion", stable: false },
    }).state,
    "SETTLING",
  );
  for (const patch of [
    { qualityOk: false },
    { prediction: { ...input.prediction, confidence: 0.69 } },
    { prediction: { ...input.prediction, quality_ok: 0 } },
    { t: 1150001 },
    { t: 899999 },
    { status: { label: "uncertain", stable: true } },
  ])
    assert.equal(coachingDecision({ ...input, ...patch }).state, "UNCERTAIN");
  assert.equal(
    coachingDecision({ ...input, prediction: null }).state,
    "WAITING",
  );
  assert.equal(
    coachingDecision({ ...input, eventType: "complete" }).state,
    "COMPLETE",
  );
});

test("placement snapshots and timestamped notes survive session export/import without changing sensor rows", () => {
  const b = newSession();
  appendSimulation(b, 500000, schedule());
  const draft = normalizeLayout(DEFAULT_LAYOUT);
  b.session.placement_metadata = {
    mode: "simulation",
    coordinate_system: "schematic_region_percent",
    sites: normalizeLayout(draft),
  };
  draft[0].x = 90;
  assert.equal(
    b.session.placement_metadata.sites[0].x,
    36,
    "draft edits must not change captured placement",
  );
  const text = 'Placement checked, "channel 1"\nSecond line.';
  addOperatorNote(b.session, { text, t_us: 200000, target: "neutral_rest" });
  const restored = readBundleFiles(bundleFiles(b));
  assert.deepEqual(restored.session.operator_notes, b.session.operator_notes);
  assert.deepEqual(
    restored.session.placement_metadata,
    b.session.placement_metadata,
  );
  assert.deepEqual(restored.emg, b.emg);
  assert.deepEqual(restored.imu, b.imu);
  const csv = parseCSV(
    toCSV(b.session.operator_notes, ["t_us", "kind", "target", "text"]),
  );
  assert.ok(JSON.stringify(csv).includes("Second line."));
  assert.throws(
    () => addOperatorNote(b.session, { text: "too late", t_us: 600000 }),
    /inside/,
  );
  assert.throws(
    () => addOperatorNote(b.session, { text: " ", t_us: 0 }),
    /note/,
  );
});

test("layout edits stay in the intended region and cannot add unsupported sensor channels", () => {
  const layout = normalizeLayout([
    { id: "imu", x: -40, y: Infinity, surface: "palmar" },
    { id: "emg_ch1", x: 120, y: 4, surface: "invalid" },
    { id: "ppg", x: 50, y: 50 },
  ]);
  assert.equal(layout.length, 5);
  assert.equal(layout.find((s) => s.id === "imu").surface, "dorsal");
  assert.equal(layout.find((s) => s.id === "imu").x, 10);
  assert.equal(layout[0].x, 90);
  assert.equal(layout[0].y, 10);
  assert.deepEqual(normalizeLayout(null), DEFAULT_LAYOUT);
});
