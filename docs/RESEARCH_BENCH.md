# Research benchmark lab

The comparison and implementation plan is in [ADVANCEMENT_PLAN.md](ADVANCEMENT_PLAN.md). These tools make CoachSim changes measurable; they do not establish superiority over MyoSuite, OpenSim or another simulator.

## Repeatable motion trials

Open **3D Model → Research bench → Motion trials**. Set forearm placement, finger controls, motor strength and gravity first. Choose a protocol and run it. The model is rebuilt at the applied placement so prior contact, velocities, motor history and manual movement cannot contaminate initial conditions. Joint motors are enabled for these tracking trials. The free ball collider is disabled. Floor and hand self-contact remain enabled.

- **Seven-posture sequence:** neutral, flexion, extension, radial deviation, ulnar deviation, pronation, supination. Each target lasts 240 fixed steps (two simulated seconds); all 1,680 post-step rows are retained. Targets are those documented for the seven study classes. This short software sequence is not the randomized participant acquisition protocol.
- **Palm impulse recovery:** hold 25° flexion for six simulated seconds. Immediately before step 361, apply 0.02 N·s in the current palm's local +Z direction at local `(0,0.06,0)` m. The full world impulse and application point are recorded at t=3 s. It is an impulse, not a sustained force or a measured human load.

Every 1/120 s row records target, smoothed command and actual angles for all 25 axes, palm quaternion, joint connection error and limit overshoot. RMSE is calculated over all rows, including transitions, for the three study axes. A low value is not evidence of biological fidelity. The response plot shows the latest five seconds while running and the whole trial at completion. Its chart reduction preserves per-bucket extrema; exported values are full resolution.

Target RMSE includes the intentionally gradual command response. A separate smoothed-command RMSE measures actual motion against the command sent to the motors. Both are retained so the command filter is not mistaken for controller tracking error.

Pause/resume does not advance simulation time. Hidden pages/workspaces suspend the runner. Long render intervals are capped at 0.1 s; discarded wall time is reported, not silently simulated. Controls that would change trial conditions are locked until **Return to manual physics**, which creates a fresh model. A completed report stays available for export after returning. Aborted runs are incomplete and cannot be exported as completed evidence.

Exported JSON includes schema/model/solver versions, timestep, configuration, impulse events, completion status, numerical summaries and all samples. Keep this artifact with the repository commit used to generate it. It is separate from the participant session ZIP.

Movement trails trace five simulated fingertips in world space, capped at 600 visible points per digit and enabled automatically in trials. They are visual history, not additional measured sensor channels. Observation poses now transform an immutable articulated reference rather than repeatedly transforming the preceding result, avoiding accumulated display drift.

## Orientation reference evaluation

Use **Orientation accuracy**. Load the noisy synthetic benchmark to exercise the evaluator, or choose **Use current IMU recording** after calibrating/importing an orientation recording in the orientation lab. This captures the current estimates with their mounting correction applied. It does not infer extra joints.

Import independent hand-to-world reference quaternions:

```csv
t_us,qx,qy,qz,qw
0,0,0,0,1
10000,0,0,0,1
```

Both recordings must use the same right-handed world frame (+Y up), anatomical hand frame and clock units (µs). Nonzero finite quaternions are normalized; duplicated/reversed timestamps, missing fields and malformed rows are rejected. Maximum 60,000 reference samples / 10 MB. The fixed reference clock offset is entered in milliseconds: `reference_time = estimate_time + offset`. Use synchronization evidence rather than optimizing the offset against the validation outcome.

Reference interpolation follows the shortest quaternion arc. Exact reference timestamps are used directly. No extrapolation is allowed; interpolation through reference gaps longer than 50 ms is excluded. Calibration samples without estimates are excluded from the denominator and counted separately. Coverage is the fraction of estimated samples that have a supported reference match, **not elapsed-time coverage**. Low coverage is visible, not silently dropped from reporting.

- **3D rotation error:** geodesic distance `2 acos(|q_est · q_ref|)` in degrees; q and −q are equivalent.
- **Tilt error:** angular separation between world-up vectors expressed in the estimated and reference hand frames. A pure world-up heading discrepancy contributes to 3D rotation error but not tilt error.
- Reports include RMSE, arithmetic mean, nearest-rank 95th percentile, maximum, coverage and every matched sample. No fitted heading correction or automatic acceptance decision is applied.

The synthetic example adds deterministic sensor noise, an acceleration pulse and a later gyro-bias change to a known generated trajectory. Its approximately one-degree result is **not hardware performance** and cannot be compared with literature results from different datasets. Use real synchronized held-out recordings and a prespecified error tolerance for thesis claims. The export preserves both input quaternion series, explicit alignment settings, provenance labels and results.

## Reproduce software evidence

From `coach_sim`, run `npm test` and `node scripts/benchmark-research.mjs`. The latter writes [research-benchmark-results.json](../evidence/research-benchmark-results.json), covering both trials at upright, inverted and oblique placements plus the synthetic orientation comparison. See [verification record](../evidence/RESEARCH_BENCH_VERIFICATION.md) for scope and limitations.
