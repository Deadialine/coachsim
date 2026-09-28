import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initPhysics } from "../src/robot/physics.mjs";
import {
  createManipulation,
  retentionEligible,
  wilson,
} from "../src/robot/manipulation.mjs";
const m = JSON.parse(
  readFileSync(
    new URL("../public/models/allegro/manifest.json", import.meta.url),
    "utf8",
  ),
);
await initPhysics();
const good = {
  released: true,
  contacts: [
    { digit: "ff", kind: "hand", normalImpulseNs: 0.001 },
    { digit: "th", kind: "hand", normalImpulseNs: 0.001 },
  ],
  displacementM: 0.01,
  speedMS: 0.01,
};
test("retention requires release, two distinct fingers, no external support and bounded movement", () => {
  assert.equal(retentionEligible(good), true);
  for (const bad of [
    { released: false },
    { contacts: good.contacts.slice(0, 1) },
    { contacts: good.contacts.map((c) => ({ ...c, digit: "ff" })) },
    {
      contacts: [
        ...good.contacts,
        { kind: "environment", normalImpulseNs: 0.001 },
      ],
    },
    { speedMS: 1 },
    { displacementM: 1 },
    { contacts: good.contacts.map((c) => ({ ...c, normalImpulseNs: 0 })) },
  ])
    assert.equal(retentionEligible({ ...good, ...bad }), false);
});
test("seeded episodes reproduce, release once, report drops/timeouts honestly and freeze after completion", () => {
  const run = () => {
    const e = createManipulation(m, { seed: 1, controller: "open-hand-v1" });
    try {
      assert.equal(e.report().complete, false);
      for (let i = 0; i < 240; i++) e.advance();
      assert.equal(e.state.released, false);
      assert.equal(e.state.heldSteps, 0);
      e.advance();
      assert.equal(e.state.released, true);
      while (!e.complete) e.advance();
      const r = e.report();
      assert.equal(r.events.filter((x) => x.type === "release").length, 1);
      assert.ok(["dropped", "timeout"].includes(r.outcome));
      e.advance();
      assert.deepEqual(e.report(), r);
      return r;
    } finally {
      e.dispose();
    }
  };
  assert.deepEqual(run(), run());
});
test("configuration validation and Wilson intervals handle zero/all success", () => {
  assert.throws(() => createManipulation(m, { seed: -1 }));
  assert.throws(() => createManipulation(m, { controller: "unknown" }));
  assert.throws(() => wilson(2, 1));
  assert.ok(wilson(0, 100).upper > 0.036 && wilson(0, 100).upper < 0.038);
  assert.ok(wilson(100, 100).lower > 0.962 && wilson(100, 100).lower < 0.964);
});
test("hand/object overlap generates real solver impulses instead of silently disabled contacts", () => {
  const e = createManipulation(m, { seed: 1 });
  try {
    let impulse = 0;
    for (let i = 0; i < 240; i++) {
      e.advance();
      impulse += e.state.contacts.reduce((s, c) => s + c.normalImpulseNs, 0);
    }
    assert.ok(impulse > 0.001);
    assert.equal(e.state.heldSteps, 0);
    assert.equal(e.state.released, false);
  } finally {
    e.dispose();
  }
});
test("event schedule applies the perturbation once; an unsupported floating object still cannot succeed", () => {
  const e = createManipulation(m, { seed: 2, controller: "open-hand-v1" });
  try {
    // Test-only zero gravity isolates event timing from early physical drops.
    e.model.world.gravity = { x: 0, y: 0, z: 0 };
    while (!e.complete) e.advance();
    const r = e.report();
    assert.equal(r.outcome, "timeout");
    assert.deepEqual(
      r.events.map((x) => [x.type, x.step]),
      [
        ["release", 240],
        ["perturbation", 480],
      ],
    );
    assert.equal(r.trace.length, 840);
    assert.equal(r.heldSteps, 0);
    assert.ok(Math.abs(r.trace[480].object.velocityMS.x - 0.002 / 0.03) < 1e-5);
  } finally {
    e.dispose();
  }
});
