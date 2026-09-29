import RAPIER from "../coach_sim/node_modules/@dimforge/rapier3d-compat/rapier.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import os from "node:os";
import { initPhysics, createRobot } from "../coach_sim/src/robot/physics.mjs";
import { homeTargets } from "../coach_sim/src/robot/model.mjs";
const root = new URL("../", import.meta.url);
const protocol = JSON.parse(
  await readFile(new URL("scripts/backend-protocol.json", root)),
);
const manifest = JSON.parse(
  await readFile(
    new URL("coach_sim/public/models/allegro/manifest.json", root),
  ),
);
await initPhysics();
const cases = [];
for (const hz of protocol.ratesHz) {
  for (const c of protocol.primitives) {
    const world = new RAPIER.World({ x: 0, y: 0, z: -protocol.gravityMS2 });
    world.timestep = 1 / hz;
    world.numSolverIterations = 32;
    world.numInternalPgsIterations = 4;
    world.integrationParameters.lengthUnit = 0.1;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, c.heightM)
      .setCanSleep(false);
    if (c.box) desc.lockRotations();
    const body = world.createRigidBody(desc);
    body.setLinvel({ x: c.vx, y: 0, z: 0 }, true);
    const r = protocol.radiusM;
    const shape = c.box
      ? RAPIER.ColliderDesc.cuboid(r, r, r)
      : RAPIER.ColliderDesc.ball(r);
    const bounce = c.id === "bounce" ? 0.5 : 0;
    world.createCollider(
      shape
        .setMass(protocol.massKg)
        .setFriction(protocol.friction)
        .setRestitution(bounce),
      body,
    );
    if (c.floor)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 10, 0.05)
          .setTranslation(0, 0, -0.05)
          .setFriction(protocol.friction)
          .setRestitution(bounce),
      );
    const trace = [],
      start = performance.now();
    for (let i = 0; i < Math.round(hz * c.seconds); i++) {
      world.step();
      const p = body.translation(),
        v = body.linvel();
      trace.push({
        timeSeconds: (i + 1) / hz,
        p: [p.x, p.y, p.z],
        v: [v.x, v.y, v.z],
      });
    }
    cases.push({
      id: c.id,
      hz,
      kind: "primitive",
      seconds: c.seconds,
      wallSeconds: (performance.now() - start) / 1000,
      trace,
    });
    world.free();
  }
  for (const id of protocol.robotCases) {
    const model = createRobot(manifest, {
        timestepSeconds: 1 / hz,
        gravity: id !== "passive-zero",
      }),
      home = homeTargets(manifest),
      trace = [],
      start = performance.now();
    for (let i = 0; i < hz * protocol.robotSeconds; i++) {
      const target = [...home];
      if (i >= hz / 2 && id === "step") target[1] = 0.4;
      if (i >= hz / 2 && id === "limit")
        target[1] = manifest.joints[1].rangeRad[1];
      model.step(target, !id.startsWith("passive"));
      const s = model.snapshot();
      trace.push({
        timeSeconds: s.simulationSeconds,
        q: s.joints.map((j) => j.positionRad),
        v: s.joints.map((j) => j.velocityRadS),
        torque: s.joints.map((j) => j.torqueNm),
        command: s.joints.map((j) => j.commandRad),
      });
    }
    cases.push({
      id,
      hz,
      kind: "robot",
      seconds: protocol.robotSeconds,
      wallSeconds: (performance.now() - start) / 1000,
      trace,
    });
    model.dispose();
  }
  console.log("Rapier completed", hz, "Hz");
}
await writeFile(
  new URL("evidence/backend-rapier-traces.json.gz", root),
  gzipSync(
    JSON.stringify({
      schema: "coachsim-backend-traces-1",
      engine: "Rapier 0.19.3",
      protocol: protocol.id,
      hardware: {
        cpu: os.cpus()[0].model,
        platform: os.platform(),
        arch: os.arch(),
        runtime: process.version,
      },
      cases,
    }),
  ),
);
