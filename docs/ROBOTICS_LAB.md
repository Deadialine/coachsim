# Robotics foundation: use and evidence

The [research roadmap](ROBOTICS_ROADMAP.md) contains the gap analysis, primary sources, implementation stages and evaluation gates. This release delivers the foundation milestone, not all later stages or a world-leading manipulation result.

## Browser laboratory

Open 3D Model → Robotics / Control & Contact. Configure a sphere's radius (0.01–0.06 m), mass (0.01–0.5 kg) and friction (0–2); apply to rebuild the model. Existing placement is retained. The displayed applied values distinguish them from uncommitted field edits. Place the object near the palm and use the hand controls. The display sphere and collision radius agree.

Choose any of the 25 joint axes and enable its independent target. Targets override that joint's coordinated curl/posture command until cleared. Motors, smoothing and limits remain active. Clear all independent targets to return to coordinated controls. Changing the selected joint does not erase other active overrides. During orientation observation or benchmark trials these controls are disabled. Standard posture/recovery trials deliberately clear independent overrides in their copied trial configuration, preserving the declared protocol.

Object contact points can be enabled in Show; amber dots mark up to 64 current solver points, including floor contacts. These are solver geometry, not skin-pressure areas. Per-link normal impulse is summed and divided by the 1/120 s physics timestep to estimate last-step average normal load. Hand and environment totals are separated. Totals sum scalar magnitudes and cannot be interpreted as a resultant force or force closure. Display updates are 5 Hz and may miss impacts. The sphere remains awake so displayed impulses are not retained from an earlier sleeping state.

The static 0.12 kg sphere check reports 1.2140 N against weight 1.1772 N: approximately 3.125% bias. Disabling sleep did not remove it. The regression gate is 5%, selected after observing this engineering-model discrepancy; this is not an independently prespecified accuracy validation. No corrective scaling is applied. Contact compliance, timestep sensitivity and hardware calibration remain research tasks. Snapshots export configuration, controls and diagnostic state separately from experiment acquisition bundles.

## Headless controller interface

From `coach_sim`, import `createRoboticsEnvironment` from `src/hand/roboticsEnvironment.mjs`. It is a JavaScript reset/step interface, **not a Python Gymnasium environment**. Initialization is asynchronous; subsequent simulation steps are synchronous. It owns its world and must be closed.

```js
const env = await createRoboticsEnvironment();
try {
  const { observation, info } = env.reset(17);
  const action = env.goalAction(); // privileged goal-aware servo baseline
  let result;
  do { result = env.step(action); }
  while (!result.terminated && !result.truncated);
  const episode = env.exportEpisode();
} finally { env.close(); }
```

The manifest fixes action order and angle ranges. Each of 25 finite actions lies in [-1,1] and maps linearly to an absolute joint target. Zero action means range midpoint, **not neutral**; `neutralAction()` produces zero-angle targets. Invalid values and commands after episode end are rejected. Observations include joint positions/commands in radians, relative angular velocities in rad/s, world fingertip coordinates in metres, object pose/velocity and solver contacts. These are privileged simulator states, not a proposed deployable sensor suite.

The joint-tracking task uses 20 Hz control and six 120 Hz physics steps per action. A uint32 seed generates a fixed target within the central portion of each joint range. Reward is negative joint-angle RMSE in radians. Success requires RMSE ≤5 degrees for ten consecutive control steps (0.5 s); the horizon is 100 steps (5 s). Success terminates; a time limit truncates. Object collision is disabled for this task. Goals are not independently certified collision-free. This tests control plumbing and tracking, not grasping or object manipulation. Exports preserve manifest, goal, seed, configuration, task rules, actions, observations and outcomes.

## Reproduction and results

Run `npm test`, `npm run build`, and `node scripts/benchmark-robotics.mjs`. The last writes [full baseline episodes](../evidence/robotics-baselines.json). Seeds 11, 29 and 47 each run a neutral and goal-aware controller with the same goal. The goal-aware controller succeeded in 18–19 control steps with final joint RMSE 0.318–0.511 degrees; neutral runs timed out with 28.911–30.456 degrees. Three seeds are a deterministic smoke benchmark, not a statistically powered superiority study or learned-policy evaluation.

The full suite passed 43 tests, including independent overrides/invalid-input rejection, contact attribution, static weight comparison, deterministic replay and episode lifecycle. Existing anatomy, arbitrary-placement, surface, acquisition and coaching tests continue to pass. The production build succeeds with existing dependency and bundle-size notices. Real robot actuation, multiple object shapes, calibrated tactile arrays, manipulation success, policy training and sim-to-real transfer are not delivered by this milestone.
