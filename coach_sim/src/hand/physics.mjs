import RAPIER from "@dimforge/rapier3d-compat";
import { smoothCommand, coupledCurl } from "./motion.mjs";
import { IDENTITY, normalize, multiply, inverse, vector } from "./frames.mjs";

export const DT = 1 / 120;
export const RAD = Math.PI / 180;
import { DIGITS, DEFAULT_CONTROLS } from "./controls.mjs";
export { DIGITS, DEFAULT_CONTROLS, PRESETS } from "./controls.mjs";
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
export function rotate(q, p) {
  const tx = 2 * (q.y * p.z - q.z * p.y),
    ty = 2 * (q.z * p.x - q.x * p.z),
    tz = 2 * (q.x * p.y - q.y * p.x);
  return v(
    p.x + q.w * tx + q.y * tz - q.z * ty,
    p.y + q.w * ty + q.z * tx - q.x * tz,
    p.z + q.w * tz + q.x * ty - q.y * tx,
  );
}
export function worldPoint(body, point) {
  return add(body.translation(), rotate(body.rotation(), point));
}
function relative(a, b) {
  return {
    x: a.w * b.x - a.x * b.w - a.y * b.z + a.z * b.y,
    y: a.w * b.y + a.x * b.z - a.y * b.w - a.z * b.x,
    z: a.w * b.z - a.x * b.y + a.y * b.x - a.z * b.w,
    w: a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z,
  };
}
export function jointAngle(j) {
  const q = relative(j.parent.rotation(), j.body.rotation());
  let angle =
    2 * Math.atan2(q.x * j.axis.x + q.y * j.axis.y + q.z * j.axis.z, q.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle / RAD;
}
let ready;
export async function initPhysics() {
  await (ready ??= RAPIER.init());
}

/** SI units. Rigid links and servo torques; no muscle-force or sensor inversion model. */
export function createHand(options = {}) {
  const baseOrientation = normalize(options.baseOrientation ?? IDENTITY);
  const basePosition = options.basePosition ?? v(0, -0.24, 0);
  const floorY = options.floorY ?? -0.295;
  if (
    ![basePosition.x, basePosition.y, basePosition.z, floorY].every(
      Number.isFinite,
    )
  )
    throw new Error("Invalid scene placement.");
  const world = new RAPIER.World(v(0, -9.81, 0));
  // Rapier's JS pipeline applies contact hooks on the event-enabled step path.
  const events = new RAPIER.EventQueue(true);
  world.timestep = DT;
  world.numSolverIterations = 32;
  world.numInternalPgsIterations = 4;
  world.integrationParameters.lengthUnit = 0.1;
  const links = [],
    joints = [];
  const bodies = {};
  const handGroups = (1 << 16) | 7;
  const base = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(basePosition.x, basePosition.y, basePosition.z)
      .setRotation(baseOrientation),
  );
  bodies.base = base;
  function link(id, parent, anchor, axis, range, shape, mass, kind = "bone") {
    const pos = worldPoint(parent, anchor);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(parent.rotation())
        .setCanSleep(false)
        .setLinearDamping(0.15)
        .setAngularDamping(0.2)
        .setCcdEnabled(true),
    );
    let collider;
    if (shape.type === "box")
      collider = RAPIER.ColliderDesc.cuboid(...shape.half);
    else
      collider = RAPIER.ColliderDesc.capsule(
        Math.max(0, shape.length / 2 - shape.radius),
        shape.radius,
      );
    const offset = shape.offset ?? v(0, (shape.length ?? 0) / 2, 0);
    collider
      .setTranslation(offset.x, offset.y, offset.z)
      .setMass(mass)
      .setFriction(0.85)
      .setRestitution(0)
      .setCollisionGroups(kind === "pivot" ? 0 : handGroups)
      .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    if (shape.rotation) collider.setRotation(shape.rotation);
    const c = world.createCollider(collider, body);
    const joint = world.createImpulseJoint(
      RAPIER.JointData.revolute(anchor, v(), axis),
      parent,
      body,
      true,
    );
    joint.setContactsEnabled(false);
    joint.setLimits(range[0] * RAD, range[1] * RAD);
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    const entry = {
      id,
      body,
      parent,
      anchor,
      axis,
      range,
      shape,
      mass,
      kind,
      collider: c,
      joint,
      target: 0,
    };
    links.push(entry);
    joints.push(entry);
    bodies[id] = body;
    return body;
  }
  const pivot = { type: "box", half: [0.03, 0.025, 0.018], offset: v() };
  const forearm = link(
    "rotation",
    base,
    v(),
    v(0, 1, 0),
    [-80, 80],
    { type: "capsule", length: 0.24, radius: 0.025 },
    0.85,
    "forearm",
  );
  const wrist = link(
    "flex",
    forearm,
    v(0, 0.24, 0),
    v(-1, 0, 0),
    [-70, 70],
    pivot,
    0.035,
    "pivot",
  );
  const palm = link(
    "deviation",
    wrist,
    v(),
    v(0, 0, -1),
    [-35, 20],
    { type: "box", half: [0.024, 0.041, 0.012], offset: v(0.012, 0.041, 0) },
    0.2,
    "palm",
  );
  const sizes = [
    [0.026, 0.08, 0.041, 0.024, 0.019],
    [0.008, 0.087, 0.045, 0.028, 0.021],
    [-0.012, 0.083, 0.042, 0.027, 0.02],
    [-0.03, 0.072, 0.032, 0.02, 0.017],
  ];
  DIGITS.forEach((name, i) => {
    const [x, y, a, b, c] = sizes[i],
      radius = i === 3 ? 0.0065 : 0.008;
    let metacarpal = palm,
      knuckle = v(x, y, 0);
    if (i >= 2) {
      const base = v(x * 0.48, 0.014, 0);
      knuckle = v(x - base.x, y - base.y, 0);
      const length = Math.hypot(knuckle.x, knuckle.y);
      const angle = -Math.atan2(knuckle.x, knuckle.y);
      metacarpal = link(
        `${name}_CMC`,
        palm,
        base,
        v(-0.8, -0.6, 0),
        [0, i === 2 ? 20 : 30],
        {
          type: "capsule",
          length,
          radius: 0.009,
          offset: v(knuckle.x / 2, knuckle.y / 2, 0),
          rotation: {
            x: 0,
            y: 0,
            z: Math.sin(angle / 2),
            w: Math.cos(angle / 2),
          },
        },
        0.04,
        "metacarpal",
      );
    }
    const mcp = link(
      `${name}_spread`,
      metacarpal,
      knuckle,
      v(0, 0, -1),
      [-20, 20],
      pivot,
      0.008,
      "pivot",
    );
    let parent = mcp,
      anchor = v();
    [a, b, c].forEach((length, k) => {
      parent = link(
        `${name}_${["MCP", "PIP", "DIP"][k]}`,
        parent,
        anchor,
        v(-1, 0, 0),
        k === 0 ? [-10, 90] : [0, k === 1 ? 110 : 80],
        { type: "capsule", length, radius: radius - k * 0.001 },
        [0.025, 0.014, 0.009][k],
        "finger",
      );
      anchor = v(0, length, 0);
    });
  });
  const cmc = link(
    "opposition",
    palm,
    v(0.032, 0.022, 0),
    v(0, 1, 0),
    [0, 65],
    pivot,
    0.012,
    "pivot",
  );
  const direction = v(0.72, 0.694, 0),
    length = 0.038;
  const thumbShape = (len) => ({
    type: "capsule",
    length: len,
    radius: 0.009,
    offset: v((direction.x * len) / 2, (direction.y * len) / 2, 0),
    rotation: {
      x: 0,
      y: 0,
      z: -Math.sin(Math.acos(direction.y) / 2),
      w: Math.cos(Math.acos(direction.y) / 2),
    },
  });
  let thumb = link(
    "thumb_CMC",
    cmc,
    v(),
    v(0, 0, 1),
    [0, 40],
    thumbShape(length),
    0.035,
    "thumb",
  );
  thumb = link(
    "thumb_MCP",
    thumb,
    v(direction.x * length, direction.y * length, 0),
    v(-direction.y, direction.x, 0),
    [0, 60],
    thumbShape(0.03),
    0.025,
    "thumb",
  );
  link(
    "thumb_IP",
    thumb,
    v(direction.x * 0.03, direction.y * 0.03, 0),
    v(-direction.y, direction.x, 0),
    [0, 80],
    thumbShape(0.024),
    0.014,
    "thumb",
  );
  const floor = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, floorY - 0.015, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.65, 0.015, 0.65)
      .setFriction(0.8)
      .setCollisionGroups((4 << 16) | 3),
    floor,
  );
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0.11, 0.19, -0.06)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(0.027)
      .setMass(0.06)
      .setFriction(0.9)
      .setRestitution(0.15)
      .setCollisionGroups((2 << 16) | 7),
    ball,
  );
  // Adjacent anatomical segments share a joint volume. Skip those pairs even
  // when a virtual two-axis carrier sits between their rigid bodies.
  const byBody = new Map(links.map((l) => [l.body.handle, l]));
  function visibleParent(link) {
    let parent = byBody.get(link.parent.handle);
    while (parent?.kind === "pivot") parent = byBody.get(parent.parent.handle);
    return parent;
  }
  const hooks = {
    filterContactPair(_a, _b, bodyA, bodyB) {
      const a = byBody.get(bodyA),
        b = byBody.get(bodyB);
      if (a && b && (visibleParent(a) === b || visibleParent(b) === a))
        return null;
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair() {
      return true;
    },
  };
  let accumulator = 0,
    steps = 0,
    discarded = 0;
  const renderedBodies = [...links.map((l) => l.body), ball];
  const previous = new Map();
  const remember = (body) =>
    previous.set(body.handle, { p: body.translation(), q: body.rotation() });
  renderedBodies.forEach(remember);
  function step(controls = DEFAULT_CONTROLS) {
    renderedBodies.forEach(remember);
    const c = { ...DEFAULT_CONTROLS, ...controls };
    world.gravity.y = c.gravity ? -9.81 : 0;
    const wristAngle = jointAngle(joints.find((j) => j.id === "flex"));
    joints.forEach((j) => {
      let target = c[j.id] ?? 0;
      const [digit, articulation] = j.id.split("_");
      if (DIGITS.includes(digit)) {
        const curl = coupledCurl(c[digit], wristAngle, c.coupling);
        target =
          articulation === "CMC"
            ? c.cup * (digit === "ring" ? 12 : 22)
            : articulation === "spread"
              ? c.spread *
                [1, 0.15, -0.45, -1][DIGITS.indexOf(digit)] *
                (1 - curl)
              : curl * { MCP: 80, PIP: 100, DIP: 66 }[articulation];
      }
      if (digit === "thumb")
        target = c.thumb * { CMC: 30, MCP: 55, IP: 70 }[articulation];
      j.target = Math.max(j.range[0], Math.min(j.range[1], target));
      const command = smoothCommand(
        j.commanded ?? 0,
        j.commandVelocity ?? 0,
        j.target,
        DT,
      );
      j.commanded = Math.max(
        j.range[0],
        Math.min(j.range[1], command.position),
      );
      j.commandVelocity =
        j.commanded === command.position ? command.velocity : 0;
      const stiffness = c.motors
        ? c.strength *
          (["rotation", "flex", "deviation"].includes(j.id) ? 20 : 0.3)
        : 0;
      j.joint.configureMotorPosition(
        j.commanded * RAD,
        stiffness,
        c.motors
          ? (["rotation", "flex", "deviation"].includes(j.id) ? 1 : 0.012) *
              Math.sqrt(c.strength)
          : 0,
      );
    });
    world.step(events, hooks);
    steps++;
  }
  return {
    floorY,
    world,
    links,
    joints,
    bodies,
    ball,
    step,
    // Observation mode only: reorient a frozen articulated pose about its palm.
    // No physics step, inferred finger motion, or position tracking is implied.
    setObservedPalmOrientation(orientation) {
      const delta = normalize(
        multiply(normalize(orientation), inverse(palm.rotation())),
      );
      const origin = palm.translation();
      for (const body of [base, ...links.map((l) => l.body)]) {
        const p = body.translation();
        const offset = vector(
          delta,
          v(p.x - origin.x, p.y - origin.y, p.z - origin.z),
        );
        body.setTranslation(add(origin, offset), true);
        body.setRotation(normalize(multiply(delta, body.rotation())), true);
        if (body !== base) {
          body.setLinvel(v(), true);
          body.setAngvel(v(), true);
          remember(body);
        }
      }
    },
    renderPose(body, interpolate = true) {
      const p = body.translation(),
        q = body.rotation(),
        prev = previous.get(body.handle);
      const alpha = interpolate
        ? Math.max(0, Math.min(1, accumulator / DT))
        : 1;
      if (!prev) return { position: p, rotation: q };
      const sign =
        prev.q.x * q.x + prev.q.y * q.y + prev.q.z * q.z + prev.q.w * q.w < 0
          ? -1
          : 1;
      const rotation = Object.fromEntries(
        ["x", "y", "z", "w"].map((k) => [
          k,
          prev.q[k] * (1 - alpha) + q[k] * sign * alpha,
        ]),
      );
      const norm = Math.hypot(...Object.values(rotation));
      for (const k of Object.keys(rotation)) rotation[k] /= norm;
      return {
        position: v(
          ...["x", "y", "z"].map((k) => prev.p[k] * (1 - alpha) + p[k] * alpha),
        ),
        rotation,
      };
    },
    advance(seconds, controls) {
      const accepted = Math.max(0, Math.min(seconds, 0.1));
      discarded += Math.max(0, seconds - accepted);
      accumulator += accepted;
      while (accumulator + 1e-10 >= DT) {
        step(controls);
        accumulator -= DT;
      }
    },
    placeBall() {
      const p = worldPoint(palm, v(0, 0.11, -0.065));
      ball.setTranslation(p, true);
      ball.setLinvel(v(), true);
      ball.setAngvel(v(), true);
      remember(ball);
    },
    diagnostics() {
      let separation = 0,
        limitError = 0,
        tracking = 0;
      for (const j of joints) {
        const a = worldPoint(j.parent, j.anchor),
          b = j.body.translation(),
          angle = jointAngle(j);
        separation = Math.max(
          separation,
          Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
        );
        limitError = Math.max(
          limitError,
          j.range[0] - angle,
          angle - j.range[1],
        );
        tracking = Math.max(tracking, Math.abs(angle - j.target));
      }
      let contacts = 0;
      world.contactPairsWith(ball.collider(0), (other) => {
        let active = false;
        world.contactPair(ball.collider(0), other, (manifold) => {
          if (manifold.numSolverContacts() > 0) active = true;
        });
        if (active) contacts++;
      });
      return {
        separationMm: separation * 1000,
        limitErrorDeg: Math.max(0, limitError),
        trackingDeg: tracking,
        contacts,
        steps,
        discarded,
        palmOrientation: { ...palm.rotation() },
        baseOrientation: { ...base.rotation() },
        angles: Object.fromEntries(joints.map((j) => [j.id, jointAngle(j)])),
        targets: Object.fromEntries(joints.map((j) => [j.id, j.target ?? 0])),
        commands: Object.fromEntries(
          joints.map((j) => [j.id, j.commanded ?? 0]),
        ),
      };
    },
    dispose() {
      events.free();
      world.free();
    },
  };
}
