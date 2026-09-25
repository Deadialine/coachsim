# Orientation upgrade verification — 24 September 2026

## Automated checks

- `cd coach_sim && npm test`: **29 passed, 0 failed**. Existing experiment, coaching, ZIP roundtrip, sensor layout, articulation, contact, interpolation and palm-surface checks continue to pass.
- `node scripts/verify-orientation.mjs`: **27/27 placements passed**. Three roll values × three pitch values × three yaw values, 240 steps each at 120 Hz, with gravity and a combined wrist/finger/cupping target. [Full configurations and per-case results](orientation-results.json).
- Maximum anchor separation across this grid: **0.0086401294 mm**, below the preselected 0.5 mm software threshold. Maximum joint-limit overshoot: **0.0045944243°**, below 1°. These describe constraint consistency during two-second test trajectories, not human anatomical accuracy or indefinite stability.
- Gravity-free global-frame equivalence: all joint angles agree within 0.15° after 180 steps. Observation rotations preserve the palm anchor, articulation and step count. Existing frame-rate independence and gravity/contact tests also pass.
- IMU checks cover a known synthetic quaternion trajectory, normalization, stationary initialization in inverted/oblique poses, constant gyro-bias recovery, linear-acceleration norm rejection, malformed values, timestamp faults, latched failure, chunked serial parsing and a full 1,600-row CSV roundtrip.
- `npm run build -- --outDir ../.verification-build`: production build passes. Existing Vite/PostCSS/browser-database warnings and the large lazily loaded physics/Three.js chunk remain; no new build failure.

## Browser checks

Local production preview checked with the desktop two-column layout and a 390 × 844 responsive override. The mobile document had no horizontal overflow. Temporary viewport overrides were reset.

Verified manual inverted and oblique placement, camera presets, surface rendering, collision overlay, synthetic playback, keyboard scrubbing to 15.99 s, mounting alignment, pause on workspace changes, and preservation of recording position after visiting Signals. All six workspace tabs remain present. No browser console errors observed. [Inverted hand screenshot](orientation-inverted.png).

CSV parsing is exercised automatically. The browser automation file-chooser attempt timed out, so a successful native file-picker import is **not** claimed. Web Serial hardware/firmware, real-world sensor accuracy, packet transport under load, long-duration drift, and participant validity are **not tested**. Live serial parsing and filter error paths are covered at the software level; the physical connection still needs a bench run.

## Interpretation

This is a verified engineering implementation and an experiment preparation tool. The baseline six-axis complementary estimator is not VQF. It has no absolute-heading reference and its simple acceleration gate cannot reject every translational disturbance. A single dorsal-hand IMU does not identify finger joints, forearm orientation or position. The displayed rigid-body hand is not a subject-specific musculoskeletal model.

See the [orientation guide and proposed physical validation protocol](../docs/ORIENTATION_LAB.md) and the [plan written before implementation](../docs/ORIENTATION_PLAN.md). No simulated result is presented as collected participant evidence.
