import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { initPhysics } from "../coach_sim/src/robot/physics.mjs";
import {
  createManipulation,
  wilson,
  PROTOCOL,
} from "../coach_sim/src/robot/manipulation.mjs";
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
const dev = process.argv.includes("--development"),
  seeds = Array.from(
    { length: dev ? 10 : 100 },
    (_, i) => (dev ? 1 : 1000) + i,
  ),
  conditions = [],
  traces = [];
for (const controller of ["open-hand-v1", "fixed-close-v1"]) {
  const episodes = [];
  for (const seed of seeds) {
    const e = createManipulation(manifest, {
      seed,
      controller,
      record: seed === seeds[0],
    });
    try {
      while (!e.complete) e.advance();
      const { trace, ...r } = e.report();
      episodes.push(r);
      if (trace.length) traces.push({ ...r, trace });
    } finally {
      e.dispose();
    }
    if (seed % 10 === 9) console.log(controller, "through seed", seed);
  }
  const counts = Object.fromEntries(
    ["success", "dropped", "timeout", "numerical-failure"].map((k) => [
      k,
      episodes.filter((e) => e.outcome === k).length,
    ]),
  );
  conditions.push({
    controller,
    counts,
    successRate: counts.success / seeds.length,
    wilson95: wilson(counts.success, seeds.length),
    episodes,
  });
  console.log(controller, counts);
}
const sourceSha256 = {};
for (const file of ["physics.mjs", "model.mjs", "manipulation.mjs"])
  sourceSha256[file] = createHash("sha256")
    .update(
      (await readFile(
        new URL(`../coach_sim/src/robot/${file}`, import.meta.url),
        "utf8",
      )).replace(/\r\n/g, "\n"),
    )
    .digest("hex");
const label = dev ? "development" : "test";
await writeFile(
  new URL(`../evidence/manipulation-${label}.json`, import.meta.url),
  JSON.stringify(
    {
      schema: "coachsim-manipulation-benchmark-1",
      protocol: PROTOCOL,
      sourceSha256,
      seeds,
      split: label,
      conditions,
    },
    null,
    2,
  ),
);
await writeFile(
  new URL(`../evidence/manipulation-${label}-traces.json.gz`, import.meta.url),
  gzipSync(JSON.stringify({ traces })),
);
