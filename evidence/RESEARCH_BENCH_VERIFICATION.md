# Research benchmark verification

Verified 2026-09-25. Scope: software behavior and numerical consistency, not human biomechanical or hardware accuracy. See [plan and primary-source comparison](../docs/ADVANCEMENT_PLAN.md) and [usage and metric definitions](../docs/RESEARCH_BENCH.md).

- Full suite: 35 tests passed. Six research tests cover fixed sampling, identical full trial rows at 30/60 rendering frames per second, impulse magnitude/timing, 2,000 observation rotations without accumulated pose drift, quaternion sign/interpolation and known-angle metrics, reference timing/gaps/coverage, and noisy synthetic estimation.
- Production build passed. Existing dependency initialization and bundle-size warnings remain.
- Both protocols completed at upright, inverted and oblique placements: six runs, 1,680 rows per posture sequence and 720 per recovery trial. Maximum connection separation across these runs was 0.004379 mm; maximum joint-limit overshoot was 0.011402 degrees. These are solver consistency measures, not anatomical accuracy.
- Smoothed-command wrist-flexion RMSE ranged from 1.149 to 2.293 degrees. Target RMSE is larger because it includes abrupt target changes and intentional command smoothing. Full summaries, configurations and events are in [machine-readable results](research-benchmark-results.json).
- Noisy synthetic orientation example: 3D rotation RMSE 0.9383 degrees, tilt RMSE 0.1009 degrees, 95th-percentile rotation error 2.2289 degrees, 1,500/1,500 estimates covered and 100 calibration samples excluded. This generated example is not a measured sensor specification or a literature comparison.
- Browser check: the six-second recovery trial completed and enabled export; returning to manual physics restored controls. Synthetic orientation evaluation displayed the expected metrics and error curves. All six original workspaces remain present.

Native reference-file selection, live hardware, real synchronized reference recordings and participant experiments are not validated by this record. A real comparison needs common coordinate frames, independently established timing and mounting, held-out recordings, and prespecified acceptance criteria. MyoSuite/OpenSim integration remains future work; current motor-driven rigid bodies do not simulate muscle physiology.
