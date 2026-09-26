import test from "node:test";
import assert from "node:assert/strict";
import {
  dualTransform,
  blendDual,
  transformPoint,
} from "../src/hand/skinning.mjs";
import { createDigitSurface } from "../src/hand/digitSurface.mjs";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  DIGITS,
} from "../src/hand/physics.mjs";
import { IDENTITY, fromEuler, vector, multiply } from "../src/hand/frames.mjs";
await initPhysics();
const close = (a, b, tolerance = 1e-6) => {
  for (const k of ["x", "y", "z"])
    assert.ok(Math.abs(a[k] - b[k]) < tolerance, `${k}: ${a[k]} / ${b[k]}`);
};
test("dual quaternion blending preserves rigid transforms and quaternion sign", () => {
  const q = fromEuler({ roll: 125, pitch: -35, yaw: 47 }),
    translation = { x: 0.2, y: -0.4, z: 1 };
  const t = dualTransform(q, translation),
    p = { x: 0.1, y: 0.3, z: -0.5 };
  const v = vector(q, p);
  const expected = {
    x: v.x + translation.x,
    y: v.y + translation.y,
    z: v.z + translation.z,
  };
  close(transformPoint(t, p), expected);
  const negative = {
    real: Object.fromEntries(Object.entries(t.real).map(([k, v]) => [k, -v])),
    dual: Object.fromEntries(Object.entries(t.dual).map(([k, v]) => [k, -v])),
  };
  close(transformPoint(blendDual([t, negative], [0.3, 0.7]), p), expected);
  const identity = dualTransform(IDENTITY, { x: 0, y: 0, z: 0 });
  const twist = dualTransform(fromEuler({ yaw: 180 }), { x: 0, y: 0, z: 0 });
  const rotated = transformPoint(blendDual([identity, twist], [0.5, 0.5]), {
    x: 1,
    y: 0,
    z: 0,
  });
  assert.ok(
    Math.abs(Math.hypot(rotated.x, rotated.y, rotated.z) - 1) < 1e-9,
    "blended twist must not collapse radius",
  );
});
test("continuous digit meshes reproduce rest poses and form closed oriented surfaces", () => {
  const hand = createHand({
    baseOrientation: fromEuler({ roll: 180, pitch: 35, yaw: 15 }),
  });
  try {
    for (const name of [...DIGITS, "thumb"]) {
      const skin = createDigitSurface(
        (name === "thumb" ? ["CMC", "MCP", "IP"] : ["MCP", "PIP", "DIP"]).map(
          (j) => hand.links.find((l) => l.id === `${name}_${j}`),
        ),
      );
      const p = skin.geometry.attributes.position;
      skin.rest.forEach((v, i) =>
        close({ x: p.getX(i), y: p.getY(i), z: p.getZ(i) }, v),
      );
      const edges = new Map(),
        idx = skin.geometry.index.array;
      for (let i = 0; i < idx.length; i += 3)
        for (const [a, b] of [
          [idx[i], idx[i + 1]],
          [idx[i + 1], idx[i + 2]],
          [idx[i + 2], idx[i]],
        ]) {
          const key = [Math.min(a, b), Math.max(a, b)].join(":");
          const e = edges.get(key) ?? { count: 0, winding: 0 };
          e.count++;
          e.winding += a < b ? 1 : -1;
          edges.set(key, e);
        }
      for (const e of edges.values()) {
        assert.equal(e.count, 2);
        assert.equal(e.winding, 0);
      }
      assert.ok(
        [...skin.geometry.attributes.normal.array].every(Number.isFinite),
      );
      skin.geometry.dispose();
    }
  } finally {
    hand.dispose();
  }
});
test("surface deformation commutes with arbitrary world placement", () => {
  const hand = createHand();
  try {
    const links = ["MCP", "PIP", "DIP"].map((k) =>
        hand.links.find((l) => l.id === `index_${k}`),
      ),
      skin = createDigitSurface(links);
    for (let i = 0; i < 180; i++)
      hand.step({ ...DEFAULT_CONTROLS, index: 0.8 });
    const poses = skin.bodies.map((body) => ({
      position: body.translation(),
      rotation: body.rotation(),
    }));
    skin.update(poses);
    const before = Array.from(skin.geometry.attributes.position.array);
    const q = fromEuler({ roll: 157, pitch: 63, yaw: -91 }),
      offset = { x: 0.2, y: -0.1, z: 0.3 };
    skin.update(
      poses.map((p) => {
        const v = vector(q, p.position);
        return {
          rotation: multiply(q, p.rotation),
          position: { x: v.x + offset.x, y: v.y + offset.y, z: v.z + offset.z },
        };
      }),
    );
    const after = skin.geometry.attributes.position;
    for (let i = 0; i < before.length / 3; i++) {
      const v = vector(q, {
        x: before[i * 3],
        y: before[i * 3 + 1],
        z: before[i * 3 + 2],
      });
      close(
        { x: after.getX(i), y: after.getY(i), z: after.getZ(i) },
        { x: v.x + offset.x, y: v.y + offset.y, z: v.z + offset.z },
      );
    }
    skin.geometry.dispose();
  } finally {
    hand.dispose();
  }
});
test("all digit envelopes remain finite under full curl, spread, opposition and palm cupping", () => {
  const hand = createHand({
    baseOrientation: fromEuler({ roll: 75, pitch: -40, yaw: 30 }),
    floorY: -0.8,
  });
  const skins = [...DIGITS, "thumb"].map((name) => {
    const links = (
      name === "thumb" ? ["CMC", "MCP", "IP"] : ["MCP", "PIP", "DIP"]
    ).map((j) => hand.links.find((l) => l.id === `${name}_${j}`));
    return { links, skin: createDigitSurface(links) };
  });
  try {
    for (let i = 0; i < 360; i++) {
      hand.step({
        ...DEFAULT_CONTROLS,
        index: 1,
        middle: 1,
        ring: 1,
        little: 1,
        thumb: 1,
        opposition: 60,
        spread: 18,
        cup: 1,
      });
      if (i % 60 === 0)
        for (const { skin } of skins) {
          skin.update(
            skin.bodies.map((body) => ({
              position: body.translation(),
              rotation: body.rotation(),
            })),
          );
          assert.ok(
            [
              ...skin.geometry.attributes.position.array,
              ...skin.geometry.attributes.normal.array,
            ].every(Number.isFinite),
          );
          assert.ok(skin.geometry.boundingSphere.radius < 0.2);
        }
    }
  } finally {
    skins.forEach((s) => s.skin.geometry.dispose());
    hand.dispose();
  }
});
