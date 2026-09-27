import { writeFile } from "node:fs/promises";
import { createRoboticsEnvironment } from "../src/hand/roboticsEnvironment.mjs";
const env = await createRoboticsEnvironment();
const episodes = [];
try {
  for (const seed of [11, 29, 47])
    for (const controller of ["neutral", "goal-aware servo"]) {
      const reset = env.reset(seed),
        action =
          controller === "neutral" ? env.neutralAction() : env.goalAction();
      let result;
      do {
        result = env.step(action);
      } while (!result.terminated && !result.truncated);
      episodes.push({ controller, reset: reset.info, ...env.exportEpisode() });
    }
} finally {
  env.close();
}
const summaries = episodes.map((e) => ({
  seed: e.seed,
  controller: e.controller,
  steps: e.trace.length,
  success: e.trace.at(-1).info.success,
  finalRmseDeg: (e.trace.at(-1).info.rmseRad * 180) / Math.PI,
}));
await writeFile(
  new URL("../../evidence/robotics-baselines.json", import.meta.url),
  JSON.stringify(
    {
      schema: "coachsim-robotics-baselines-1",
      scope: "Privileged joint tracking; not manipulation or learned control",
      summaries,
      episodes,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summaries));
