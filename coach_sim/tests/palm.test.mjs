import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  worldPoint,
} from "../src/hand/physics.mjs";
import { createPalmSurface } from "../src/hand/palmSurface.mjs";
await initPhysics();

test("ulnar metacarpals carry their complete fingers and return after cupping", () => {
  const h = createHand();
  try {
    assert.equal(
      h.bodies.ring_spread,
      h.links.find((l) => l.id === "ring_MCP").parent,
    );
    for (const digit of ["ring", "little"])
      assert.equal(
        h.links.find((l) => l.id === `${digit}_spread`).parent,
        h.bodies[`${digit}_CMC`],
      );
    for (const digit of ["index", "middle"])
      assert.equal(
        h.links.find((l) => l.id === `${digit}_spread`).parent,
        h.bodies.deviation,
      );
    const knuckle = () =>
      worldPoint(h.bodies.little_spread, { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 600; i++) h.step(DEFAULT_CONTROLS);
    const open = knuckle();
    for (let i = 0; i < 600; i++) h.step({ ...DEFAULT_CONTROLS, cup: 1 });
    const cupped = knuckle(),
      d = h.diagnostics();
    assert.ok(
      cupped.z < open.z - 0.015,
      "cupping must move the entire little-finger root palmward",
    );
    assert.ok(Math.abs(d.angles.ring_CMC - 12) < 2);
    assert.ok(Math.abs(d.angles.little_CMC - 22) < 2);
    assert.ok(d.separationMm < 0.1 && d.limitErrorDeg < 0.5);
    for (let i = 0; i < 600; i++) h.step(DEFAULT_CONTROLS);
    const returned = knuckle();
    assert.ok(
      Math.hypot(
        returned.x - open.x,
        returned.y - open.y,
        returned.z - open.z,
      ) < 0.002,
    );
  } finally {
    h.dispose();
  }
});

test("palm envelope is closed and stays finite as its metacarpal anchors deform", () => {
  const surface = createPalmSurface(),
    indices = surface.geometry.index.array;
  try {
    const edges = new Map();
    for (let i = 0; i < indices.length; i += 3)
      for (const [a, b] of [
        [indices[i], indices[i + 1]],
        [indices[i + 1], indices[i + 2]],
        [indices[i + 2], indices[i]],
      ]) {
        const key = [a, b].sort((x, y) => x - y).join(":");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    assert.ok([...edges.values()].every((n) => n === 2));
    const bases = [-0.02, -0.006, 0.004, 0.018].map(
      (x) => new THREE.Vector3(x, 0.002, 0),
    );
    const heads = [
      new THREE.Vector3(-0.03, 0.07, -0.025),
      new THREE.Vector3(-0.012, 0.08, -0.012),
      new THREE.Vector3(0.008, 0.087, 0),
      new THREE.Vector3(0.032, 0.08, 0),
    ];
    surface.update(bases, heads, new THREE.Vector3(0, 0, 1));
    assert.ok(
      [
        ...surface.geometry.attributes.position.array,
        ...surface.geometry.attributes.normal.array,
      ].every(Number.isFinite),
    );
    assert.ok(surface.geometry.boundingSphere.radius > 0.03);
  } finally {
    surface.geometry.dispose();
  }
});
