import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createRobot, initPhysics } from "../coach_sim/src/robot/physics.mjs";
import { createResponseTrial } from "../coach_sim/src/robot/trial.mjs";
import { fromEuler } from "../coach_sim/src/hand/frames.mjs";
const manifest = JSON.parse(
  await readFile(
    new URL(
      "../coach_sim/public/models/allegro/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
await initPhysics();
const cases = [],
  traces = [];
for (const [placement, euler] of Object.entries({
  upright: { yaw: 90 },
  inverted: { yaw: -90 },
  horizontal: {},
  palmUp: { roll: -90 },
})) {
  for (let joint = 0; joint < 16; joint++) {
    const model = createRobot(manifest, { orientation: fromEuler(euler) });
    try {
      const trial = createResponseTrial(model, manifest, joint);
      while (!trial.complete) trial.advance();
      const result = trial.report();
      // Retain full 240 Hz traces for one representative actuator per placement;
      // summarize the remaining cases to keep the evidence bundle reviewable.
      const { trace, ...summary } = result;
      cases.push({ placement, ...summary });
      if (joint === 1) traces.push({ placement, ...result });
      console.log(
        placement,
        manifest.joints[joint].id,
        "error",
        result.metrics.finalErrorRad.toFixed(4),
        "anchor",
        result.metrics.maxAnchorErrorM.toExponential(2),
      );
    } finally {
      model.dispose();
    }
  }
}
await writeFile(
  new URL("../evidence/allegro-response-baselines.json", import.meta.url),
  JSON.stringify({
    schema: "coachsim-allegro-baselines-1",
    note: "64 deterministic synthetic engineering checks, not independent hardware trials. No statistical performance claim.",
    cases,
  }),
);
await writeFile(
  new URL("../evidence/allegro-response-traces.json.gz", import.meta.url),
  gzipSync(JSON.stringify({ schema: "coachsim-allegro-traces-1", traces })),
);
