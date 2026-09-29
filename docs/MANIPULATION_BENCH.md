# Milestone 3: grasp-retention benchmark

## Frozen implementation plan

Add a separate Allegro manipulation bench: seeded sphere placement, a declared one-second positioning fixture, release under gravity, a lateral perturbation and a sustained-contact retention test. Compare a fixed closing controller with an open-hand control. Preserve the model/response laboratories and all thesis acquisition workspaces.

Before evaluating the test seeds, freeze `sphere-retention-v1`: 240 Hz, 3.5 s horizon, palm-up mount, 25 mm sphere radius, 30 g mass, friction 0.8, placement jitter ±2 mm per axis. Position in the source world frame: (0.055, 0, 0.045) m, transformed with the palm-up mount. The object is held kinematically for the first 1 s, then becomes dynamic without a velocity kick. Apply one world-x impulse of +0.002 N·s at 2 s if the episode is still active. There is no collision floor.

Success requires the final full second (240 consecutive physics samples) after the perturbation to have positive normal impulse on at least two distinct finger chains, displacement ≤80 mm from the release position and speed ≤0.15 m/s. Palm-only support is not a grasp. No kinematically supported sample counts toward success. A fall of >100 mm or displacement >140 mm after release ends as `dropped`; reaching the horizon without the sustained hold ends as `timeout`. Report numerical failures separately and never count partial/cancelled episodes as complete.

Controller `fixed-close-v1`: finger targets [0, 0.9, 0.8, 0.6] rad for index/middle/ring; thumb [1, 0.5, 0.6, 0.7] rad, within source limits. `open-hand-v1` commands the model home. Both use the same default bounded drive (0.15 N·m torque cap, 2 rad/s command slew), source model and gravity. Neither is learned, contact-adaptive or physically calibrated.

Development seeds: 1–10. Freeze controls and thresholds before evaluating held-out seeds 1000–1099 for each controller. Retain all outcomes, sampled starts, protocol/model/solver/controller versions, counts and 95% Wilson intervals. These intervals summarize the specified synthetic placement distribution, not physical-world reliability. Zero success is an informative baseline, not grounds to tune against test seeds.

## Validation gates

- A supported object, floor-only contact, one finger, transient contact, excessive speed or partial trial cannot pass.
- Release and impulse occur exactly once at their declared steps; seeded trials repeat independently of rendering.
- Complete trials export actual object pose/velocity, per-body normal impulses/loads, digit attribution, targets, joint states and event times.
- At least 100 held-out seeds per controller; retain drops, timeouts and failures separately.
- Check local browser operation, existing tests, production build and hosted preview.

Contact loads are ideal Rapier impulse / timestep estimates, not calibrated tactile readings. No lift/reorientation, learned policy, compliant fingertips, physical calibration or cross-engine performance claim is included in this retention milestone.

## Delivered comparison

Open `?view=hand&model=manipulation` or select **Manipulation bench** in the 3D Model workspace. Choose a seed and baseline, run or cancel a trial, inspect collision geometry and contact loads, and export a complete episode. Trial controls lock during execution; cancelled episodes cannot be exported as complete. The six thesis workspaces and four-sEMG/one-IMU acquisition scope remain separate.

| Controller | Test episodes | Success | Dropped | Timeout | Numerical failure | 95% Wilson success interval |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Open hand | 100 | 0 | 100 | 0 | 0 | 0–3.70% |
| Fixed closing command | 100 | 0 | 100 | 0 | 0 | 0–3.70% |

Development seeds also produced 10 drops per controller. This is a functioning retention benchmark, **not a successful grasp controller**. The commanded closing pose does not establish a stable two-finger hold at these starts under the declared torque limits. The paired synthetic starts are deliberately narrow; these intervals must not be interpreted as physical reliability or object generalization. Early drops terminate before the disturbance, so disturbance recovery was not demonstrated by either baseline.

[Test evidence](../evidence/manipulation-test.json) retains all 200 sampled configurations, final states, outcomes and events. [Development evidence](../evidence/manipulation-development.json) retains the separate development set. Compressed `manipulation-*-traces.json.gz` files retain full 240 Hz traces for the first seed of each controller in each split; full trajectories are not stored for every batch episode. Individual browser exports contain the full trajectory. Source hashes describe implementation bytes with CRLF normalized to LF.

Reproduce from the repository root after installing app dependencies:

```sh
node scripts/benchmark-manipulation.mjs --development
node scripts/benchmark-manipulation.mjs
```

## Contact correction and verification

The new object-contact regression exposed an invalid Rapier solver flag in the previous Allegro implementation: `COMPUTE_IMPULSES` was undefined. The corrected `COMPUTE_IMPULSE` enables solver forces. Fixed fingertip bodies are grouped with their welded parent for collision exclusions, preserving the source model's same-body and adjacent-body filtering. Earlier Allegro contact behavior must not be treated as validated evidence. The 64 actuator-response checks were rerun after this correction.

Five new automated tests cover eligibility rejection, repeatability and release timing, parameter validation, actual nonzero contact impulses, and single perturbation timing. A zero-gravity test isolates the impulse schedule and confirms that a floating object cannot pass. All 55 regression tests and the production build pass. Local browser checks confirm rendering, a completed dropped trial and export availability only after completion.

Next controller work must use development placements and a new held-out set: establish opposing contacts, regulate closing effort from contact feedback, and then test disturbance recovery. Keep this failed baseline and its fixed rules for comparison; do not relax thresholds to manufacture success.
