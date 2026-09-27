import test from "node:test";
import assert from "node:assert/strict";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  worldPoint,
} from "../src/hand/physics.mjs";
import { createRoboticsEnvironment } from "../src/hand/roboticsEnvironment.mjs";
import { objectConfiguration } from "../src/hand/robotics.mjs";
await initPhysics();
test("independent joint commands preserve limits and reject invalid commands before stepping", () => {
  const h = createHand();
  try {
    h.step({
      ...DEFAULT_CONTROLS,
      index: 1,
      jointTargets: { index_PIP: 20, index_DIP: 5 },
    });
    const d = h.diagnostics();
    assert.equal(d.targets.index_MCP, 80);
    assert.equal(d.targets.index_PIP, 20);
    assert.equal(d.targets.index_DIP, 5);
    for (const jointTargets of [
      { index_PIP: NaN },
      { index_PIP: 111 },
      { imaginary: 2 },
      null,
    ])
      assert.throws(() => h.step({ ...DEFAULT_CONTROLS, jointTargets }));
    assert.equal(h.diagnostics().steps, 1);
  } finally {
    h.dispose();
  }
});
test("configured object reports static weight with floor contact separated from hand contact", () => {
  assert.throws(() => objectConfiguration({ mass: 0 }));
  assert.throws(() => objectConfiguration({ radius: NaN }));
  assert.throws(() => objectConfiguration({ friction: -1 }));
  const h = createHand({
    object: { mass: 0.12, radius: 0.035, friction: 0.4 },
  });
  try {
    h.ball.setTranslation({ x: 0.4, y: 0.1, z: 0 }, true);
    for (let i = 0; i < 600; i++) h.step(DEFAULT_CONTROLS);
    const c = h.diagnostics().objectContacts;
    assert.equal(h.ball.collider(0).radius(), 0.03500000014901161);
    // Contact impulses are solver estimates; preserve the observed bias instead of rescaling it away.
    assert.equal(c.handNormalLoadN, 0);
    assert.ok(
      Math.abs(c.environmentNormalLoadN - 0.12 * 9.81) / (0.12 * 9.81) < 0.05,
      JSON.stringify(c),
    );
    console.log(
      JSON.stringify({
        restingWeightN: 0.12 * 9.81,
        reportedNormalLoadN: c.environmentNormalLoadN,
        relativeError:
          Math.abs(c.environmentNormalLoadN - 0.12 * 9.81) / (0.12 * 9.81),
      }),
    );
    assert.ok(c.pairs.every((p) => p.body === "floor"));
  } finally {
    h.dispose();
  }
});
test("object impacts are attributed to hand links with finite world contact points", () => {
  const h = createHand();
  try {
    h.ball.setTranslation(
      worldPoint(h.bodies.deviation, { x: 0, y: 0.04, z: -0.041 }),
      true,
    );
    h.ball.setLinvel({ x: 0, y: 0, z: 0.3 }, true);
    let contact;
    for (let i = 0; i < 50; i++) {
      h.step({ ...DEFAULT_CONTROLS, gravity: false });
      const c = h.diagnostics().objectContacts;
      if (c.handNormalLoadN > 0) {
        contact = c;
        break;
      }
    }
    assert.ok(contact);
    assert.equal(contact.environmentNormalLoadN, 0);
    assert.ok(contact.pairs.some((p) => p.body === "deviation"));
    assert.ok(
      contact.pairs
        .flatMap((p) => p.pointsWorldM)
        .every((p) => Object.values(p).every(Number.isFinite)),
    );
  } finally {
    h.dispose();
  }
});
test("headless episodes reproduce seeds and actions, enforce lifecycle and expose explicit task outcomes", async () => {
  const env = await createRoboticsEnvironment();
  try {
    assert.throws(() => env.step([]));
    const start = env.reset(17);
    assert.equal(start.info.manifest.length, 25);
    assert.throws(() => env.step(Array(25).fill(NaN)));
    assert.throws(() => env.step(Array(25).fill(2)));
    const action = env.goalAction();
    let result;
    do {
      result = env.step(action);
    } while (!result.terminated && !result.truncated);
    const first = env.exportEpisode();
    assert.equal(result.observation.simulationSeconds, first.trace.length / 20);
    assert.equal(first.complete, true);
    assert.throws(() => env.step(action));
    env.reset(17);
    do {
      result = env.step(action);
    } while (!result.terminated && !result.truncated);
    assert.deepEqual(env.exportEpisode(), first);
    const other = env.reset(18);
    assert.notDeepEqual(
      other.observation.desiredGoalRad,
      start.observation.desiredGoalRad,
    );
    assert.throws(() => env.reset(-1));
  } finally {
    env.close();
  }
  assert.throws(() => env.observe());
});
