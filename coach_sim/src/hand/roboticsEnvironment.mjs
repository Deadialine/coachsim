import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  DT,
  RAD,
  worldPoint,
  DIGITS,
} from "./physics.mjs";
import { vector } from "./frames.mjs";
// Standalone JS interface inspired by reset/step APIs; not a Gymnasium package.
export async function createRoboticsEnvironment(configuration = {}) {
  await initPhysics();
  const setup = structuredClone(
    configuration.setup ?? { basePosition: { x: 0, y: 0, z: 0 }, floorY: -0.6 },
  );
  let model,
    episodeStep = 0,
    held = 0,
    done = false,
    goal = [],
    seedValue,
    manifest = [],
    trace = [];
  const controlSubsteps = 6,
    horizon = 100,
    toleranceRad = 5 * RAD,
    holdSteps = 10;
  function observe() {
    const d = model.diagnostics();
    return {
      jointPositionRad: manifest.map((j) => d.angles[j.id] * RAD),
      jointVelocityRadS: model.joints.map((j) => {
        const a = j.parent.angvel(),
          b = j.body.angvel(),
          axis = vector(j.parent.rotation(), j.axis);
        return (
          (b.x - a.x) * axis.x + (b.y - a.y) * axis.y + (b.z - a.z) * axis.z
        );
      }),
      commandRad: manifest.map((j) => d.commands[j.id] * RAD),
      desiredGoalRad: [...goal],
      fingertipsWorldM: [...DIGITS, "thumb"].map((digit) => {
        const l = model.links.find(
            (l) => l.id === `${digit}_${digit === "thumb" ? "IP" : "DIP"}`,
          ),
          o = l.shape.offset;
        return worldPoint(
          l.body,
          o
            ? { x: o.x * 2, y: o.y * 2, z: 0 }
            : { x: 0, y: l.shape.length, z: 0 },
        );
      }),
      object: {
        positionM: { ...model.ball.translation() },
        orientation: { ...model.ball.rotation() },
        velocityMS: { ...model.ball.linvel() },
      },
      contacts: d.objectContacts,
      simulationSeconds: episodeStep * controlSubsteps * DT,
      provenance: "privileged simulator state",
    };
  }
  function reset(seed = 1) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
      throw Error("Seed must be a uint32 integer.");
    model?.dispose();
    model = createHand(setup);
    model.ball.collider(0).setEnabled(false);
    seedValue = seed;
    let state = seed;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    manifest = model.joints.map((j) => ({
      id: j.id,
      rangeRad: j.range.map((v) => v * RAD),
    }));
    goal = manifest.map(
      (j) =>
        j.rangeRad[0] +
        (0.25 + 0.35 * random()) * (j.rangeRad[1] - j.rangeRad[0]),
    );
    episodeStep = 0;
    held = 0;
    done = false;
    trace = [];
    return {
      observation: observe(),
      info: {
        schema: "coachsim-robotics-episode-1",
        model: "coachsim-engineering-hand-25",
        solver: "Rapier 0.19.3",
        seed,
        setup: structuredClone(setup),
        manifest: structuredClone(manifest),
        controlHz: 20,
        physicsHz: 120,
        horizon,
        success: { rmseRadians: toleranceRad, consecutiveSteps: holdSteps },
        objectCollision: "disabled for joint tracking",
      },
    };
  }
  function step(action) {
    if (!model) throw Error("Reset the environment first.");
    if (done) throw Error("Episode ended; reset before stepping.");
    if (
      !Array.isArray(action) ||
      action.length !== manifest.length ||
      action.some((a) => !Number.isFinite(a) || a < -1 || a > 1)
    )
      throw Error("Action must contain 25 finite values in [-1,1].");
    const jointTargets = Object.fromEntries(
      manifest.map((j, i) => [
        j.id,
        (j.rangeRad[0] +
          (action[i] + 1) * 0.5 * (j.rangeRad[1] - j.rangeRad[0])) /
          RAD,
      ]),
    );
    // Avoid floating-point excursions beyond a declared endpoint.
    for (const j of model.joints)
      jointTargets[j.id] = Math.max(
        j.range[0],
        Math.min(j.range[1], jointTargets[j.id]),
      );
    for (let i = 0; i < controlSubsteps; i++)
      model.step({ ...DEFAULT_CONTROLS, jointTargets });
    episodeStep++;
    const observation = observe();
    const rmse = Math.sqrt(
      goal.reduce(
        (s, g, i) => s + (g - observation.jointPositionRad[i]) ** 2,
        0,
      ) / goal.length,
    );
    held = rmse <= toleranceRad ? held + 1 : 0;
    const terminated = held >= holdSteps,
      truncated = !terminated && episodeStep >= horizon;
    done = terminated || truncated;
    const result = {
      observation,
      reward: -rmse,
      terminated,
      truncated,
      info: { success: terminated, rmseRad: rmse, heldSteps: held },
    };
    trace.push({ action: [...action], ...structuredClone(result) });
    return result;
  }
  return {
    reset,
    step,
    observe: () => {
      if (!model) throw Error("Reset first.");
      return observe();
    },
    goalAction: () =>
      manifest.map(
        (j, i) =>
          (2 * (goal[i] - j.rangeRad[0])) / (j.rangeRad[1] - j.rangeRad[0]) - 1,
      ),
    neutralAction: () =>
      manifest.map(
        (j) => (2 * (0 - j.rangeRad[0])) / (j.rangeRad[1] - j.rangeRad[0]) - 1,
      ),
    exportEpisode: () => ({
      schema: "coachsim-robotics-episode-1",
      model: "coachsim-engineering-hand-25",
      solver: "Rapier 0.19.3",
      task: "joint-tracking-v1",
      objectCollision: "disabled",
      provenance: "privileged simulator state",
      seed: seedValue,
      setup: structuredClone(setup),
      manifest: structuredClone(manifest),
      goalRad: [...goal],
      controlSubsteps,
      timestepSeconds: DT,
      horizon,
      toleranceRad,
      holdSteps,
      complete: done,
      trace: structuredClone(trace),
    }),
    close: () => {
      model?.dispose();
      model = null;
      done = true;
    },
  };
}
