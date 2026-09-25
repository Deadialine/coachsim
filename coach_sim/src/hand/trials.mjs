import { DT, worldPoint } from "./physics.mjs";
import { DEFAULT_CONTROLS, PRESETS } from "./controls.mjs";
import { vector } from "./frames.mjs";
export const TRIALS = {
  postures: {
    title: "Seven-posture sequence",
    seconds: 14,
    description:
      "Two seconds per study target. Records the complete response, including transitions.",
  },
  recovery: {
    title: "Palm impulse recovery",
    seconds: 6,
    description:
      "Hold 25° wrist flexion; apply a 0.02 N·s palm-normal impulse at 3 seconds.",
  },
};
export const AXES = ["flex", "deviation", "rotation"];
export function createTrial(model, configuration) {
  const { scenario, setup } = configuration;
  if (!TRIALS[scenario]) throw Error("Unknown trial.");
  const controls = {
    ...DEFAULT_CONTROLS,
    ...configuration.controls,
    motors: true,
  };
  // The trial excludes the free ball so contact placement cannot change repeatability.
  model.ball.collider(0).setEnabled(false);
  const rows = [],
    events = [];
  let step = 0,
    accumulator = 0,
    discarded = 0;
  const count = Math.round(TRIALS[scenario].seconds / DT),
    sum = { flex: 0, deviation: 0, rotation: 0 },
    commandSum = { flex: 0, deviation: 0, rotation: 0 };
  let maxAnchor = 0,
    maxLimit = 0;
  function advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw Error("Invalid elapsed time.");
    accumulator += Math.min(seconds, 0.1);
    discarded += Math.max(0, seconds - 0.1);
    while (accumulator + 1e-10 >= DT && step < count) {
      const phase =
        scenario === "postures"
          ? Object.keys(PRESETS)[Math.floor(step / 240)]
          : "loaded_hold";
      const target =
        scenario === "postures"
          ? PRESETS[phase]
          : { flex: 25, deviation: 0, rotation: 0 };
      if (scenario === "recovery" && step === 360) {
        const palm = model.bodies.deviation,
          impulse = vector(palm.rotation(), { x: 0, y: 0, z: 0.02 }),
          point = worldPoint(palm, { x: 0, y: 0.06, z: 0 });
        palm.applyImpulseAtPoint(impulse, point, true);
        events.push({
          step,
          t_s: step * DT,
          type: "palm_impulse",
          impulseWorldNs: impulse,
          pointWorldM: point,
        });
      }
      model.step({ ...controls, ...target });
      step++;
      accumulator -= DT;
      const d = model.diagnostics();
      maxAnchor = Math.max(maxAnchor, d.separationMm);
      maxLimit = Math.max(maxLimit, d.limitErrorDeg);
      for (const axis of AXES) {
        sum[axis] += (d.angles[axis] - d.targets[axis]) ** 2;
        commandSum[axis] += (d.angles[axis] - d.commands[axis]) ** 2;
      }
      rows.push({
        t_s: step * DT,
        phase,
        angles: d.angles,
        targets: d.targets,
        commands: d.commands,
        anchorMm: d.separationMm,
        limitDeg: d.limitErrorDeg,
        palmOrientation: d.palmOrientation,
      });
    }
  }
  function report(includeRows = false) {
    return {
      schema: "coachsim-motion-trial-1",
      model: "coachsim-25-axis-orientation-v1",
      solver: "Rapier 0.19.3",
      timestepSeconds: DT,
      provenance: "software simulation",
      configuration: {
        scenario,
        setup,
        controls,
        ball: "disabled",
        impulse:
          scenario === "recovery"
            ? {
                atStep: 360,
                palmNormalNs: 0.02,
                palmPointM: { x: 0, y: 0.06, z: 0 },
              }
            : null,
      },
      complete: step === count,
      steps: step,
      totalSteps: count,
      seconds: step * DT,
      discardedWallSeconds: discarded,
      summary: {
        rmseDeg: Object.fromEntries(
          AXES.map((k) => [k, step ? Math.sqrt(sum[k] / step) : null]),
        ),
        commandRmseDeg: Object.fromEntries(
          AXES.map((k) => [k, step ? Math.sqrt(commandSum[k] / step) : null]),
        ),
        maxAnchorMm: maxAnchor,
        maxLimitDeg: maxLimit,
      },
      events: [...events],
      rows: includeRows ? [...rows] : rows.slice(-600),
    };
  }
  return {
    advance,
    report,
    get complete() {
      return step === count;
    },
  };
}
