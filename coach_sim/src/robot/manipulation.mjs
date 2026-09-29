import RAPIER from "@dimforge/rapier3d-compat";
import { createRobot, ROBOT_DT, DEFAULT_DRIVE } from "./physics.mjs";
import { homeTargets, vector, sub } from "./model.mjs";
import { fromEuler } from "../hand/frames.mjs";
export const PROTOCOL = Object.freeze({
  id: "sphere-retention-v1",
  horizonSteps: 840,
  releaseStep: 240,
  impulseStep: 480,
  holdSteps: 240,
  radiusM: 0.025,
  massKg: 0.03,
  friction: 0.8,
  jitterM: 0.002,
  maxHoldDistanceM: 0.08,
  maxHoldSpeedMS: 0.15,
  dropHeightM: 0.1,
  dropDistanceM: 0.14,
  impulseNs: { x: 0.002, y: 0, z: 0 },
});
export function retentionEligible({
  released,
  contacts,
  displacementM,
  speedMS,
}) {
  const digits = new Set(
    contacts
      .filter(
        (c) =>
          c.normalImpulseNs > 1e-9 &&
          ["ff", "mf", "rf", "th"].includes(c.digit),
      )
      .map((c) => c.digit),
  );
  return (
    released &&
    digits.size >= 2 &&
    !contacts.some(
      (c) => c.kind === "environment" && c.normalImpulseNs > 1e-9,
    ) &&
    displacementM <= PROTOCOL.maxHoldDistanceM &&
    speedMS <= PROTOCOL.maxHoldSpeedMS
  );
}
export function wilson(successes, total) {
  if (
    !Number.isInteger(total) ||
    total < 1 ||
    !Number.isInteger(successes) ||
    successes < 0 ||
    successes > total
  )
    throw Error("Invalid binomial counts.");
  const z = 1.959963984540054,
    p = successes / total,
    d = 1 + (z * z) / total,
    center = (p + (z * z) / (2 * total)) / d,
    half =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return {
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
    confidence: 0.95,
  };
}
export function createManipulation(
  manifest,
  { seed = 1, controller = "fixed-close-v1", record = true } = {},
) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error("Seed must be a uint32.");
  if (!["fixed-close-v1", "open-hand-v1"].includes(controller))
    throw Error("Unknown retention controller.");
  const orientation = fromEuler({ roll: -90 }),
    model = createRobot(manifest, { orientation, drive: DEFAULT_DRIVE });
  let rng = seed;
  const random = () => {
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const nativeStart = {
      x: 0.055 + (random() * 2 - 1) * PROTOCOL.jitterM,
      y: (random() * 2 - 1) * PROTOCOL.jitterM,
      z: 0.045 + (random() * 2 - 1) * PROTOCOL.jitterM,
    },
    start = vector(orientation, nativeStart);
  const body = model.world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(start.x, start.y, start.z)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  const collider = model.world.createCollider(
    RAPIER.ColliderDesc.ball(PROTOCOL.radiusM)
      .setMass(PROTOCOL.massKg)
      .setFriction(PROTOCOL.friction)
      .setRestitution(0),
    body,
  );
  model.testObject = { body, radius: PROTOCOL.radiusM };
  const targets =
    controller === "open-hand-v1"
      ? homeTargets(manifest)
      : [
          0, 0.9, 0.8, 0.6, 0, 0.9, 0.8, 0.6, 0, 0.9, 0.8, 0.6, 1, 0.5, 0.6,
          0.7,
        ];
  let count = 0,
    held = 0,
    released = false,
    done = false,
    outcome = "incomplete",
    last = null;
  const events = [],
    trace = [];
  function contacts() {
    const rows = [];
    model.world.contactPairsWith(collider, (other) => {
      const link = model.links.find(
          (l) => l.body.handle === other.parent()?.handle,
        ),
        name = link?.definition.id ?? "environment";
      model.world.contactPair(collider, other, (manifold) => {
        if (!manifold.numSolverContacts()) return;
        let impulse = 0;
        for (let i = 0; i < manifold.numContacts(); i++)
          impulse += Math.max(0, manifold.contactImpulse(i));
        rows.push({
          body: name,
          kind: link ? "hand" : "environment",
          digit: link ? name.slice(0, 2) : null,
          normalImpulseNs: impulse,
          normalLoadN: impulse / ROBOT_DT,
          pointsWorldM: Array.from(
            { length: manifold.numSolverContacts() },
            (_, i) => ({ ...manifold.solverContactPoint(i) }),
          ),
        });
      });
    });
    return rows;
  }
  function advance() {
    if (done) return last;
    if (count === PROTOCOL.releaseStep) {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      released = true;
      events.push({
        type: "release",
        step: count,
        timeSeconds: count * ROBOT_DT,
      });
    }
    if (count === PROTOCOL.impulseStep) {
      body.applyImpulse(PROTOCOL.impulseNs, true);
      events.push({
        type: "perturbation",
        step: count,
        timeSeconds: count * ROBOT_DT,
        impulseNs: { ...PROTOCOL.impulseNs },
      });
    }
    model.step(targets);
    count++;
    const positionM = { ...body.translation() },
      velocityMS = { ...body.linvel() },
      rotation = { ...body.rotation() },
      pairs = contacts(),
      displacementM = Math.hypot(...Object.values(sub(positionM, start))),
      speedMS = Math.hypot(...Object.values(velocityMS));
    const jointState = model.snapshot().joints;
    const finite = [
      ...Object.values(positionM),
      ...Object.values(velocityMS),
      ...Object.values(rotation),
      displacementM,
      speedMS,
      ...pairs.map((c) => c.normalLoadN),
      ...jointState.flatMap((j) => [j.positionRad, j.velocityRadS, j.torqueNm]),
    ].every(Number.isFinite);
    const eligible = retentionEligible({
      released,
      contacts: pairs,
      displacementM,
      speedMS,
    });
    held = count > PROTOCOL.impulseStep && eligible ? held + 1 : 0;
    if (!finite) {
      done = true;
      outcome = "numerical-failure";
    } else if (
      released &&
      (start.y - positionM.y > PROTOCOL.dropHeightM ||
        displacementM > PROTOCOL.dropDistanceM)
    ) {
      done = true;
      outcome = "dropped";
    } else if (count === PROTOCOL.horizonSteps) {
      done = true;
      outcome = held >= PROTOCOL.holdSteps ? "success" : "timeout";
    }
    last = {
      step: count,
      timeSeconds: count * ROBOT_DT,
      phase: !released
        ? "fixture-supported"
        : count <= PROTOCOL.impulseStep
          ? "released"
          : "perturbed",
      released,
      heldSteps: held,
      eligible,
      outcome,
      object: { positionM, rotation, velocityMS, displacementM, speedMS },
      contacts: pairs,
    };
    if (record)
      trace.push({
        ...structuredClone(last),
        joints: jointState,
        targetsRad: [...targets],
      });
    return last;
  }
  return {
    model,
    advance,
    get complete() {
      return done;
    },
    get state() {
      return last;
    },
    report() {
      return {
        schema: "coachsim-manipulation-episode-1",
        protocol: structuredClone(PROTOCOL),
        model: manifest.id,
        sourceCommit: manifest.sourceCommit,
        solver: "Rapier 0.19.3",
        physicsHz: 240,
        seed,
        controller,
        configuration: {
          drive: { ...DEFAULT_DRIVE },
          orientation,
          nativeStart,
          startWorldM: start,
          targetsRad: targets,
        },
        provenance:
          "synthetic retention test; ideal contacts; no physical calibration",
        complete: done,
        outcome,
        heldSteps: held,
        events: structuredClone(events),
        final: structuredClone(last),
        trace: structuredClone(trace),
      };
    },
    dispose() {
      model.dispose();
    },
  };
}
