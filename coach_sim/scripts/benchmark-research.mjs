import { writeFile } from "node:fs/promises";
import {
  initPhysics,
  createHand,
  DEFAULT_CONTROLS,
} from "../src/hand/physics.mjs";
import { createTrial } from "../src/hand/trials.mjs";
import { fromEuler, PLACEMENTS } from "../src/hand/frames.mjs";
import {
  validationDemo,
  compareOrientations,
} from "../src/hand/validation.mjs";
await initPhysics();
const trials = [];
for (const placement of ["upright", "inverted", "oblique"])
  for (const scenario of ["postures", "recovery"]) {
    const setup = {
        baseOrientation: fromEuler(PLACEMENTS[placement]),
        basePosition: { x: 0, y: 0, z: 0 },
        floorY: -0.6,
      },
      model = createHand(setup);
    try {
      const runner = createTrial(model, {
        scenario,
        setup,
        controls: DEFAULT_CONTROLS,
      });
      while (!runner.complete) runner.advance(1 / 60);
      const { rows, ...report } = runner.report(true);
      trials.push({ placement, ...report, sampleCount: rows.length });
    } finally {
      model.dispose();
    }
  }
const demo = validationDemo(),
  { rows, ...accuracy } = compareOrientations(demo.estimates, demo.reference);
const result = {
  schema: "coachsim-research-benchmark-1",
  provenance: "software verification only",
  trials,
  syntheticOrientation: { ...accuracy, source: demo.provenance },
};
await writeFile(
  new URL("../../evidence/research-benchmark-results.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    trials: trials.map((t) => ({
      placement: t.placement,
      scenario: t.configuration.scenario,
      ...t.summary,
    })),
    synthetic: accuracy,
  }),
);
if (
  trials.some(
    (t) =>
      !t.complete || t.summary.maxAnchorMm >= 0.5 || t.summary.maxLimitDeg >= 1,
  )
)
  process.exitCode = 1;
