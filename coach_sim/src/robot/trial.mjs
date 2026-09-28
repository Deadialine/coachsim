import { homeTargets, clamp } from "./model.mjs";
import { ROBOT_DT } from "./physics.mjs";
export function createResponseTrial(model, manifest, jointIndex) {
  if (
    !Number.isInteger(jointIndex) ||
    jointIndex < 0 ||
    jointIndex >= manifest.joints.length
  )
    throw Error("Invalid response-test actuator.");
  const targets = homeTargets(manifest),
    start = targets[jointIndex],
    goal = clamp(start + 0.4, ...manifest.joints[jointIndex].rangeRad),
    trace = [];
  let count = 0;
  return {
    advance() {
      if (count >= 960) return;
      if (count === 240) targets[jointIndex] = goal;
      model.step(targets);
      count++;
      trace.push({ ...model.snapshot(), targetRad: targets[jointIndex] });
    },
    get complete() {
      return count === 960;
    },
    report() {
      const last = trace.at(-1),
        after = trace.slice(240),
        tail = trace.slice(840);
      return {
        schema: "coachsim-allegro-response-1",
        model: manifest.id,
        sourceCommit: manifest.sourceCommit,
        compiler: manifest.compiler,
        solver: "Rapier 0.19.3",
        provenance: "synthetic response test, not hardware calibration",
        protocol: {
          id: "home-plus-0.4-rad-v1",
          joint: manifest.joints[jointIndex].id,
          baselineSeconds: 1,
          responseSeconds: 3,
          startRad: start,
          goalRad: goal,
          timestepSeconds: ROBOT_DT,
        },
        configuration: last
          ? {
              drive: last.drive,
              orientation: last.orientation,
              gravity: last.gravity,
            }
          : null,
        complete: count === 960,
        metrics: last
          ? {
              finalErrorRad: goal - last.joints[jointIndex].positionRad,
              tailRmseRad: tail.length
                ? Math.sqrt(
                    tail.reduce(
                      (s, r) =>
                        s + (goal - r.joints[jointIndex].positionRad) ** 2,
                      0,
                    ) / tail.length,
                  )
                : null,
              peakTorqueNm: Math.max(
                ...trace.map((r) => Math.abs(r.joints[jointIndex].torqueNm)),
              ),
              saturationSamples: after.filter(
                (r) => r.joints[jointIndex].saturated,
              ).length,
              maxAnchorErrorM: Math.max(
                ...trace.flatMap((r) => r.joints.map((j) => j.anchorErrorM)),
              ),
            }
          : null,
        trace: structuredClone(trace),
      };
    },
  };
}
