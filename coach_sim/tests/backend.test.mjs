import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initPhysics, createRobot } from "../src/robot/physics.mjs";
import { homeTargets } from "../src/robot/model.mjs";
const m = JSON.parse(
  readFileSync(
    new URL("../public/models/allegro/manifest.json", import.meta.url),
  ),
);
await initPhysics();
test("reference rates advance exact declared time and scale slew without changing browser default", () => {
  assert.throws(() => createRobot(m, { timestepSeconds: 0 }));
  assert.throws(() => createRobot(m, { timestepSeconds: NaN }));
  for (const hz of [120, 240, 480]) {
    const model = createRobot(m, { timestepSeconds: 1 / hz, gravity: false });
    try {
      const q = homeTargets(m);
      q[1] = 0.4;
      model.step(q);
      const s = model.snapshot();
      assert.equal(s.simulationSeconds, 1 / hz);
      assert.ok(Math.abs(s.joints[1].commandRad - 2 / hz) < 1e-12);
      assert.ok(s.joints.every((j) => Math.abs(j.torqueNm) <= 0.15));
    } finally {
      model.dispose();
    }
  }
  const model = createRobot(m);
  try {
    assert.equal(model.snapshot().timestepSeconds, 1 / 240);
  } finally {
    model.dispose();
  }
});
