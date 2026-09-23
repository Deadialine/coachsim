import test from "node:test";
import assert from "node:assert/strict";
import { smoothCommand, coupledCurl } from "../src/hand/motion.mjs";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  DT,
} from "../src/hand/physics.mjs";
await initPhysics();

test("command motion has bounded velocity and acceleration through reversal and settles", () => {
  let p = 0,
    v = 0;
  for (let i = 0; i < 1800; i++) {
    const target = i < 80 ? 70 : -60;
    const next = smoothCommand(p, v, target, DT);
    assert.ok(Math.abs(next.velocity) <= 120);
    assert.ok(Math.abs(next.velocity - v) <= 600 * DT + 1e-9);
    p = next.position;
    v = next.velocity;
  }
  assert.ok(Math.abs(p + 60) < 1e-8);
  assert.ok(Math.abs(v) < 1e-8);
});

test("optional wrist coupling preserves independent controls at zero and stays bounded", () => {
  for (const curl of [0, 0.2, 0.7, 1]) {
    for (const wrist of [-70, 0, 70]) {
      assert.equal(coupledCurl(curl, wrist, 0), curl);
      assert.ok(
        coupledCurl(curl, wrist, 1) >= 0 && coupledCurl(curl, wrist, 1) <= 1,
      );
    }
    assert.ok(coupledCurl(curl, -40, 1) >= coupledCurl(curl, 40, 1));
  }
});

test("coupled simulation responds to actual wrist angle while maintaining constraints", () => {
  const hand = createHand();
  try {
    const c = { ...DEFAULT_CONTROLS, coupling: 1, flex: -40 };
    for (let i = 0; i < 600; i++) hand.step(c);
    const extension = hand.diagnostics();
    assert.ok(extension.angles.index_PIP > 20);
    assert.ok(extension.targets.index_PIP > 20);
    for (let i = 0; i < 600; i++) hand.step({ ...c, flex: 45 });
    const flexion = hand.diagnostics();
    assert.ok(flexion.angles.index_PIP < extension.angles.index_PIP - 15);
    assert.ok(flexion.separationMm < 0.1);
    assert.ok(flexion.limitErrorDeg < 0.5);
  } finally {
    hand.dispose();
  }
});

test("render interpolation brackets solved poses without changing physics; teleport resets history", () => {
  const hand = createHand();
  try {
    const initial = hand.ball.translation().y;
    hand.advance(DT * 1.5, DEFAULT_CONTROLS);
    const solved = hand.ball.translation().y;
    const drawn = hand.renderPose(hand.ball);
    assert.ok(drawn.position.y < initial && drawn.position.y > solved);
    assert.ok(
      Math.abs(Math.hypot(...Object.values(drawn.rotation)) - 1) < 1e-10,
    );
    assert.equal(hand.ball.translation().y, solved);
    assert.equal(hand.renderPose(hand.ball, false).position.y, solved);
    hand.placeBall();
    assert.deepEqual(
      hand.renderPose(hand.ball).position,
      { ...hand.ball.translation() },
    );
  } finally {
    hand.dispose();
  }
});
