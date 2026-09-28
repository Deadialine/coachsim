import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  validateManifest,
  forwardKinematics,
  homeTargets,
} from "../src/robot/model.mjs";
import { createRobot, initPhysics, ROBOT_DT } from "../src/robot/physics.mjs";
import { createResponseTrial } from "../src/robot/trial.mjs";
const path = new URL("../public/models/allegro/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", path), "utf8"),
);
await initPhysics();
test("Allegro assets retain pinned hashes; model has valid masses, inertia and actuator order", () => {
  validateManifest(manifest);
  for (const [file, hash] of Object.entries(manifest.sha256))
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(file, path)))
        .digest("hex"),
      hash,
      file,
    );
  assert.equal(manifest.joints[12].id, "thj0");
  assert.equal(manifest.joints[12].rangeRad[0], 0.263);
});
test("independent FK agrees with compiled MuJoCo poses for all 21 bodies", () => {
  for (const f of manifest.fixtures) {
    const actual = forwardKinematics(manifest, f.qposRad);
    for (const b of f.bodies) {
      const p = actual[b.id];
      assert.ok(
        Math.hypot(
          p.position.x - b.position.x,
          p.position.y - b.position.y,
          p.position.z - b.position.z,
        ) < 1e-9,
        b.id,
      );
      assert.ok(
        Math.abs(
          Object.keys(p.rotation).reduce(
            (s, k) => s + p.rotation[k] * b.rotation[k],
            0,
          ),
        ) >
          1 - 1e-9,
        b.id,
      );
    }
  }
});
test("solver starts at valid home pose, preserves anchors, rejects invalid commands before stepping", () => {
  const m = createRobot(manifest, { gravity: false }),
    home = homeTargets(manifest);
  try {
    m.snapshot().joints.forEach((j, i) =>
      assert.ok(Math.abs(j.positionRad - home[i]) < 1e-5, j.id),
    );
    const before = m.snapshot();
    assert.throws(() => m.step(home.map(() => NaN)));
    assert.deepEqual(m.snapshot(), before);
    for (let k = 0; k < 240; k++) m.step(home);
    const s = m.snapshot();
    assert.ok(s.joints.every((j) => j.anchorErrorM < 1e-4));
    assert.ok(
      s.joints.every((j, i) => Math.abs(j.positionRad - home[i]) < 0.03),
    );
  } finally {
    m.dispose();
  }
});
test("articulated mass matrix agrees with independent MuJoCo compilation at three poses", () => {
  for (const f of manifest.fixtures) {
    const m = createRobot(manifest, { gravity: false, targets: f.qposRad });
    try {
      const M = m.massMatrix();
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++)
          assert.ok(
            Math.abs(M[i][j] - f.massMatrixKgM2[i][j]) < 1e-9,
            `${i},${j}`,
          );
    } finally {
      m.dispose();
    }
  }
});
test("bounded drive tracks a proximal command and exports actual applied torque", () => {
  const m = createRobot(manifest, { gravity: false }),
    target = homeTargets(manifest);
  target[1] = 0.6;
  try {
    for (let k = 0; k < 720; k++) {
      m.step(target);
      const s = m.snapshot();
      assert.ok(
        s.joints.every(
          (j) =>
            Number.isFinite(j.positionRad) &&
            Math.abs(j.torqueNm) <= m.drive.maxTorqueNm,
        ),
      );
    }
    const s = m.snapshot();
    console.log("Allegro proximal response", s.joints[1]);
    assert.ok(Math.abs(s.joints[1].positionRad - 0.6) < 0.08);
    assert.ok(s.joints.every((j) => j.anchorErrorM < 0.001));
    assert.equal(s.simulationSeconds, 720 * ROBOT_DT);
  } finally {
    m.dispose();
  }
});
test("torque saturation and command slew are enforced; disabling drives removes their effort", () => {
  const m = createRobot(manifest, {
      gravity: false,
      drive: { maxTorqueNm: 1e-5, commandRateRadS: 0.3 },
    }),
    targets = homeTargets(manifest);
  targets[1] = 1.5;
  try {
    let last = m.snapshot(),
      saturated = false;
    for (let k = 0; k < 120; k++) {
      m.step(targets);
      const next = m.snapshot();
      next.joints.forEach((j, i) => {
        assert.ok(Math.abs(j.torqueNm) <= 1e-5);
        assert.ok(
          Math.abs(j.commandRad - last.joints[i].commandRad) <=
            0.3 * ROBOT_DT + 1e-12,
        );
        saturated ||= j.saturated;
      });
      last = next;
    }
    assert.ok(saturated);
    m.step(targets, false);
    assert.ok(
      m.snapshot().joints.every((j) => j.torqueNm === 0 && !j.saturated),
    );
  } finally {
    m.dispose();
  }
});
test("response protocol produces deterministic complete traces and stops at its declared horizon", () => {
  const run = () => {
    const m = createRobot(manifest, { gravity: false });
    try {
      const t = createResponseTrial(m, manifest, 1);
      assert.equal(t.report().complete, false);
      for (let i = 0; i < 960; i++) t.advance();
      const report = t.report();
      assert.equal(report.complete, true);
      assert.equal(report.trace.length, 960);
      assert.equal(report.trace[239].targetRad, 0);
      assert.equal(report.trace[240].targetRad, 0.4);
      t.advance();
      assert.deepEqual(t.report(), report);
      return report;
    } finally {
      m.dispose();
    }
  };
  assert.deepEqual(run(), run());
});
