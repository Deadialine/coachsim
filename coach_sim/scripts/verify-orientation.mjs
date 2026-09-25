import { writeFile } from "node:fs/promises";
import {
  createHand,
  initPhysics,
  DEFAULT_CONTROLS,
  DT,
} from "../src/hand/physics.mjs";
import { fromEuler } from "../src/hand/frames.mjs";
await initPhysics();
const controls = {
  ...DEFAULT_CONTROLS,
  flex: 35,
  deviation: -20,
  rotation: 40,
  cup: 1,
  index: 0.6,
  middle: 0.6,
  ring: 0.6,
  little: 0.6,
  thumb: 0.4,
  opposition: 45,
};
const cases = [];
for (const roll of [-180, 0, 70])
  for (const pitch of [-90, 0, 55])
    for (const yaw of [-90, 0, 120]) {
      const placement = { roll, pitch, yaw },
        setup = {
          baseOrientation: fromEuler(placement),
          basePosition: { x: 0, y: 0, z: 0 },
          floorY: -0.6,
        };
      const h = createHand(setup);
      let anchorMm = 0,
        limitDeg = 0;
      try {
        for (let step = 0; step < 240; step++) {
          h.step(controls);
          const d = h.diagnostics();
          anchorMm = Math.max(anchorMm, d.separationMm);
          limitDeg = Math.max(limitDeg, d.limitErrorDeg);
        }
        cases.push({
          placement,
          setup,
          maximumAnchorMm: anchorMm,
          maximumLimitDeg: limitDeg,
          finalAngles: h.diagnostics().angles,
          passed: anchorMm < 0.5 && limitDeg < 1,
        });
      } finally {
        h.dispose();
      }
    }
const report = {
  schema: "coachsim-orientation-verification-1",
  model: "25-axis rigid articulated hand",
  solver: "Rapier 0.19.3",
  timestepSeconds: DT,
  stepsPerCase: 240,
  controls,
  thresholds: { anchorMm: 0.5, limitDeg: 1 },
  scope: "Numerical verification, not anatomical or sensor validation",
  cases,
};
await writeFile(
  new URL("../../evidence/orientation-results.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    cases: cases.length,
    passed: cases.every((c) => c.passed),
    maximumAnchorMm: Math.max(...cases.map((c) => c.maximumAnchorMm)),
    maximumLimitDeg: Math.max(...cases.map((c) => c.maximumLimitDeg)),
  }),
);
if (cases.some((c) => !c.passed)) process.exitCode = 1;
