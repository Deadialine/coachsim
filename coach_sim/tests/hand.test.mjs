import test from "node:test";
import assert from "node:assert/strict";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  PRESETS,
  DT,
  worldPoint,
} from "../src/hand/physics.mjs";
await initPhysics();
function run(hand, controls, steps = 600) {
  for (let i = 0; i < steps; i++)
    hand.step({ ...DEFAULT_CONTROLS, ...controls });
}
function near(a, b, tolerance, message) {
  assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} versus ${b}`);
}

test("all five digits connect to one supported tree with 25 bounded axes", () => {
  const h = createHand();
  try {
    assert.equal(h.joints.length, 25);
    assert.equal(new Set(h.links.map((l) => l.body.handle)).size, 25);
    for (const j of h.joints) {
      assert.ok(j.joint.limitsEnabled());
      assert.ok(j.body.mass() > 0);
      let parent = j;
      const seen = new Set();
      while (parent) {
        assert.ok(!seen.has(parent.id));
        seen.add(parent.id);
        parent = h.links.find((l) => l.body === parent.parent);
      }
      assert.ok(
        h.links.some((l) => l.body === j.parent) || j.parent === h.bodies.base,
      );
    }
    assert.equal(h.joints.filter((j) => j.id.startsWith("thumb_")).length, 3);
    assert.ok(h.bodies.opposition);
    near(h.diagnostics().separationMm, 0, 0.001, "initial joint separation");
  } finally {
    h.dispose();
  }
});

test("study postures and extreme curls stay connected and within mechanical limits", () => {
  const scenarios = {
    ...PRESETS,
    full_curl: {
      cup: 1,
      index: 1,
      middle: 1,
      ring: 1,
      little: 1,
      thumb: 1,
      opposition: 65,
    },
    combined_limits: {
      cup: 1,
      flex: 70,
      deviation: -35,
      rotation: 80,
      index: 1,
      thumb: 1,
      opposition: 65,
    },
  };
  for (const [name, pose] of Object.entries(scenarios)) {
    const h = createHand();
    let separation = 0,
      limit = 0;
    try {
      for (let i = 0; i < 600; i++) {
        h.step({ ...DEFAULT_CONTROLS, ...pose });
        const d = h.diagnostics();
        separation = Math.max(separation, d.separationMm);
        limit = Math.max(limit, d.limitErrorDeg);
        for (const l of h.links)
          for (const number of Object.values(l.body.translation()))
            assert.ok(Number.isFinite(number), name);
      }
      assert.ok(separation < 0.5, `${name}: anchor gap ${separation} mm`);
      assert.ok(limit < 1, `${name}: limit overshoot ${limit} deg`);
      if (PRESETS[name])
        for (const axis of ["flex", "rotation", "deviation"])
          near(h.diagnostics().angles[axis], pose[axis], 3, `${name}/${axis}`);
      console.log(
        `${name}: max anchor gap ${separation.toFixed(4)} mm; limit overshoot ${limit.toFixed(4)} deg`,
      );
    } finally {
      h.dispose();
    }
  }
});

test("motors apply dynamics, and gravity moves released joints", () => {
  const h = createHand();
  try {
    h.step({ ...DEFAULT_CONTROLS, gravity: false, flex: 45 });
    assert.ok(
      h.diagnostics().angles.flex < 10,
      "a target must not teleport the hand",
    );
    run(h, { gravity: false, flex: 45 });
    near(
      h.diagnostics().angles.flex,
      45,
      0.5,
      "settled motor target without gravity",
    );
    const held = h.diagnostics().angles.flex;
    run(h, { motors: false, flex: 45 }, 240);
    assert.ok(
      Math.abs(h.diagnostics().angles.flex - held) > 10,
      "released wrist must respond to gravity",
    );
    assert.ok(h.diagnostics().separationMm < 0.5);
    near(h.bodies.base.translation().y, -0.24, 1e-5, "support stays fixed");
  } finally {
    h.dispose();
  }
});

test("fixed timesteps give the same motion at 30 and 60 render frames per second", () => {
  const a = createHand(),
    b = createHand(),
    controls = { ...DEFAULT_CONTROLS, index: 0.8, flex: 35 };
  try {
    for (let i = 0; i < 60; i++) a.advance(1 / 30, controls);
    for (let i = 0; i < 120; i++) b.advance(1 / 60, controls);
    assert.equal(a.diagnostics().steps, 240);
    assert.equal(b.diagnostics().steps, 240);
    for (const id of Object.keys(a.diagnostics().angles))
      near(a.diagnostics().angles[id], b.diagnostics().angles[id], 1e-5, id);
    a.advance(60, controls);
    assert.equal(a.diagnostics().steps, 252);
    near(a.diagnostics().discarded, 59.9, 1e-8, "background pause cap");
  } finally {
    a.dispose();
    b.dispose();
  }
});

test("ball follows gravity, rests on the floor, and transfers a contact impulse to the hand", () => {
  const h = createHand();
  try {
    h.ball.setTranslation({ x: 0.25, y: 0.15, z: 0 }, true);
    h.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    run(h, {}, 12);
    near(
      h.ball.translation().y,
      0.15 - 0.5 * 9.81 * (12 * DT) ** 2,
      0.006,
      "ballistic fall",
    );
    run(h, {}, 240);
    near(h.ball.translation().y, -0.295 + 0.027, 0.002, "floor contact height");
    assert.ok(h.diagnostics().contacts > 0, "floor contact reported");
    h.ball.setTranslation({ x: 0, y: 0.045, z: 0.09 }, true);
    h.ball.setLinvel({ x: 0, y: 0, z: -0.5 }, true);
    let handContact = false;
    for (let i = 0; i < 70; i++) {
      h.step({ ...DEFAULT_CONTROLS, gravity: false });
      for (const link of h.links)
        h.world.contactPair(h.ball.collider(0), link.collider, (m) => {
          if (m.numSolverContacts() > 0) handContact = true;
        });
    }
    assert.ok(
      handContact,
      "ball must contact the hand rather than passing through",
    );
    assert.ok(h.ball.linvel().z > -0.1, "contact must change ball momentum");
  } finally {
    h.dispose();
  }
});

test("self-contact prevents unrestricted thumb penetration while adjacent joint volumes are excluded", () => {
  const h = createHand();
  let nonAdjacent = false;
  try {
    run(h, {
      index: 1,
      middle: 1,
      ring: 1,
      little: 1,
      thumb: 1,
      opposition: 65,
    });
    for (const a of h.links)
      for (const b of h.links) {
        if (a === b) continue;
        h.world.contactPair(a.collider, b.collider, (m) => {
          if (m.numSolverContacts() > 0) nonAdjacent = true;
          if (a.id === "rotation" && b.id === "deviation")
            assert.equal(
              m.numSolverContacts(),
              0,
              "wrist neighbors must not fight their own joint",
            );
        });
      }
    assert.ok(nonAdjacent, "full curl should produce hand self-contact");
    assert.ok(
      h.diagnostics().trackingDeg > 1,
      "obstructed motors should not force every target angle",
    );
    for (const j of h.joints) {
      const a = worldPoint(j.parent, j.anchor),
        b = j.body.translation();
      assert.ok(
        Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.0005,
        "contact should not break the joint",
      );
    }
  } finally {
    h.dispose();
  }
});
