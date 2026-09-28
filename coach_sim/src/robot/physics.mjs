import RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../hand/physics.mjs";
import {
  validateManifest,
  validateTargets,
  homeTargets,
  forwardKinematics,
  IDENTITY,
  normalize,
  multiply,
  inverse,
  vector,
  add,
  sub,
  scale,
  dot,
  clamp,
} from "./model.mjs";
export { initPhysics };
export const ROBOT_DT = 1 / 240;
// Simulation choices, not manufacturer torque/speed specifications.
export const DEFAULT_DRIVE = Object.freeze({
  kp: 1,
  kd: 0.02,
  maxTorqueNm: 0.15,
  commandRateRadS: 2,
});
export function driveConfiguration(input = {}) {
  const d = { ...DEFAULT_DRIVE, ...input };
  for (const [k, max] of Object.entries({
    kp: 5,
    kd: 0.2,
    maxTorqueNm: 0.5,
    commandRateRadS: 5,
  }))
    if (!Number.isFinite(d[k]) || d[k] <= 0 || d[k] > max)
      throw Error(`Invalid drive setting: ${k}`);
  return d;
}
export function createRobot(manifest, options = {}) {
  validateManifest(manifest);
  const drive = driveConfiguration(options.drive),
    placement = normalize(options.orientation ?? IDENTITY);
  const initial = options.targets ?? homeTargets(manifest);
  validateTargets(manifest, initial);
  const poses = forwardKinematics(manifest, initial);
  const world = new RAPIER.World({
    x: 0,
    y: options.gravity === false ? 0 : -9.81,
    z: 0,
  });
  world.timestep = ROBOT_DT;
  world.numSolverIterations = 32;
  world.numInternalPgsIterations = 4;
  world.integrationParameters.lengthUnit = 0.1;
  const events = new RAPIER.EventQueue(true),
    bodies = {},
    links = [],
    joints = [],
    excluded = new Set(manifest.exclusions.map((p) => [...p].sort().join("|"))),
    colliderBodies = new Map();
  for (const b of manifest.bodies) {
    // All solver bodies use the common bind-world basis. CAD/inertia/anchors are
    // baked into that basis so Rapier's shared-axis revolute API handles rotated joints.
    const pose = poses[b.id],
      orientation = multiply(
        placement,
        multiply(pose.rotation, inverse(b.bindRotation)),
      );
    const pos = vector(placement, pose.position),
      desc =
        b.parent === "world"
          ? RAPIER.RigidBodyDesc.fixed()
          : RAPIER.RigidBodyDesc.dynamic();
    desc
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(orientation)
      .setCanSleep(false)
      .setCcdEnabled(true);
    if (b.parent !== "world")
      desc.setAdditionalMassProperties(
        b.massKg,
        vector(b.bindRotation, b.centerOfMass),
        b.principalInertiaKgM2,
        multiply(b.bindRotation, b.inertiaRotation),
      );
    const body = world.createRigidBody(desc);
    bodies[b.id] = body;
    links.push({ definition: b, body });
    for (const g of b.geoms.filter((g) => g.collision)) {
      let shape =
        g.type === "box"
          ? RAPIER.ColliderDesc.cuboid(...g.size)
          : g.type === "capsule"
            ? RAPIER.ColliderDesc.capsule(g.size[1], g.size[0])
            : RAPIER.ColliderDesc.ball(g.size[0]);
      const p = vector(b.bindRotation, g.position);
      // MuJoCo capsule is z-aligned; Rapier capsule is y-aligned.
      let rot = multiply(b.bindRotation, g.rotation);
      if (g.type === "capsule")
        rot = multiply(rot, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
      shape
        .setTranslation(p.x, p.y, p.z)
        .setRotation(rot)
        .setMass(0)
        .setFriction(0.8)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
      const c = world.createCollider(shape, body);
      colliderBodies.set(c.handle, b.id);
    }
    if (b.parent !== "world") {
      const parent = manifest.bodies.find((p) => p.id === b.parent),
        anchor = sub(b.bindPosition, parent.bindPosition),
        jd = manifest.joints.find((j) => j.body === b.id);
      const axis = jd ? vector(b.bindRotation, jd.axis) : null;
      const joint = world.createImpulseJoint(
        jd
          ? RAPIER.JointData.revolute(anchor, { x: 0, y: 0, z: 0 }, axis)
          : RAPIER.JointData.fixed(
              anchor,
              IDENTITY,
              { x: 0, y: 0, z: 0 },
              IDENTITY,
            ),
        bodies[b.parent],
        body,
        true,
      );
      joint.setContactsEnabled(false);
      excluded.add([b.id, b.parent].sort().join("|"));
      if (jd) {
        joint.setLimits(...jd.rangeRad);
        joints.push({
          definition: jd,
          body,
          parent: bodies[b.parent],
          joint,
          axis,
          anchor,
          command: initial[manifest.joints.indexOf(jd)],
          torque: 0,
          saturated: false,
        });
      }
    }
  }
  // Public action order is the source actuator order, never incidental tree order.
  joints.sort(
    (a, b) =>
      manifest.joints.indexOf(a.definition) -
      manifest.joints.indexOf(b.definition),
  );
  const ancestry = links.map((l) => {
    const indices = [];
    let id = l.definition.id;
    while (id !== "world") {
      const k = joints.findIndex((j) => j.definition.body === id);
      if (k >= 0) indices.push(k);
      id = manifest.bodies.find((b) => b.id === id).parent;
    }
    return indices;
  });
  let steps = 0;
  const hooks = {
    filterContactPair(a, b) {
      return excluded.has(
        [colliderBodies.get(a), colliderBodies.get(b)].sort().join("|"),
      )
        ? null
        : RAPIER.SolverFlags.COMPUTE_IMPULSES;
    },
  };
  function angle(j) {
    const q = multiply(inverse(j.parent.rotation()), j.body.rotation());
    let a = 2 * Math.atan2(dot(q, j.axis), q.w);
    return Math.atan2(Math.sin(a), Math.cos(a));
  }
  function velocity(j, axis) {
    return dot(sub(j.body.angvel(), j.parent.angvel()), axis);
  }
  const cross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  function massMatrix(axes) {
    const n = joints.length,
      M = Array.from({ length: n }, () => Array(n).fill(0)),
      anchors = joints.map((j) => j.body.translation());
    links.forEach(({ body, definition: b }, l) => {
      if (body.isFixed()) return;
      const com = add(
          body.translation(),
          vector(body.rotation(), vector(b.bindRotation, b.centerOfMass)),
        ),
        R = multiply(
          body.rotation(),
          multiply(b.bindRotation, b.inertiaRotation),
        );
      const Iaxis = axes.map((a) => {
        const v = vector(inverse(R), a),
          I = b.principalInertiaKgM2;
        return vector(R, { x: v.x * I.x, y: v.y * I.y, z: v.z * I.z });
      });
      const linear = axes.map((a, k) => cross(a, sub(com, anchors[k])));
      for (const i of ancestry[l])
        for (const j of ancestry[l])
          M[i][j] +=
            b.massKg * dot(linear[i], linear[j]) + dot(axes[i], Iaxis[j]);
    });
    return M;
  }
  function solve(A, b) {
    const n = b.length,
      L = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        L[i][j] = i === j ? Math.sqrt(Math.max(1e-15, s)) : s / L[j][j];
      }
    const y = [],
      x = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < i; j++) s -= L[i][j] * y[j];
      y[i] = s / L[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= L[j][i] * x[j];
      x[i] = s / L[i][i];
    }
    return x;
  }
  function step(targets, enabled = true) {
    validateTargets(manifest, targets);
    for (const { body } of links) body.resetTorques(false);
    const axes = joints.map((j) => vector(j.parent.rotation(), j.axis)),
      requested = [];
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i],
        axis = axes[i],
        q = angle(j),
        vel = velocity(j, axis);
      j.command += clamp(
        targets[i] - j.command,
        -drive.commandRateRadS * ROBOT_DT,
        drive.commandRateRadS * ROBOT_DT,
      );
      requested.push(
        drive.kp * (j.command - q - ROBOT_DT * vel) - drive.kd * vel,
      );
    }
    // Implicit PD using the articulated mass matrix from link Jacobians.
    // Contact and velocity-dependent bias forces are not predicted in this controller.
    const M = massMatrix(axes),
      gain = ROBOT_DT * drive.kd + ROBOT_DT ** 2 * drive.kp;
    M.forEach((row, i) => (row[i] += gain));
    const acceleration = solve(M, requested);
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i],
        axis = axes[i],
        effort = requested[i] - gain * acceleration[i];
      j.torque = enabled
        ? clamp(effort, -drive.maxTorqueNm, drive.maxTorqueNm)
        : 0;
      j.saturated = enabled && Math.abs(effort) > drive.maxTorqueNm;
      j.body.addTorque(scale(axis, j.torque), true);
      if (!j.parent.isFixed()) j.parent.addTorque(scale(axis, -j.torque), true);
    }
    world.step(events, hooks);
    steps++;
  }
  function snapshot() {
    return {
      schema: "coachsim-allegro-state-1",
      model: manifest.id,
      sourceCommit: manifest.sourceCommit,
      solver: "Rapier 0.19.3",
      timestepSeconds: ROBOT_DT,
      simulationSeconds: steps * ROBOT_DT,
      drive: { ...drive },
      orientation: { ...placement },
      gravity: options.gravity !== false,
      provenance: "simulation; uncalibrated actuator assumptions",
      joints: joints.map((j) => ({
        id: j.definition.id,
        positionRad: angle(j),
        velocityRadS: velocity(j, vector(j.parent.rotation(), j.axis)),
        commandRad: j.command,
        torqueNm: j.torque,
        saturated: j.saturated,
        anchorErrorM: Math.hypot(
          ...Object.values(
            sub(
              add(
                j.parent.translation(),
                vector(j.parent.rotation(), j.anchor),
              ),
              j.body.translation(),
            ),
          ),
        ),
      })),
    };
  }
  return {
    world,
    bodies,
    links,
    joints,
    drive,
    step,
    snapshot,
    massMatrix: () =>
      massMatrix(joints.map((j) => vector(j.parent.rotation(), j.axis))),
    dispose() {
      events.free();
      world.free();
    },
  };
}
