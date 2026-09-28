# CoachSim robotics research and implementation roadmap

26 September 2026. Written before implementing the robotics foundation. Goal: an accessible, reproducible dexterous-hand research platform, with an eventual independently evaluated robotics backend. This is a staged program, not a claim of world-leading performance. The current human-shaped engineering hand is not a calibrated Shadow/Allegro robot.

## Evidence review

| Primary source and reading scope | Relevant finding | CoachSim consequence |
| --- | --- | --- |
| [Gymnasium Robotics HandReach documentation](https://robotics.farama.org/envs/shadow_dexterous_hand/reach/), action/observation/task sections | Shadow Hand has explicit actuator mappings, control substeps, goals and observations; robot joints and actuators are not interchangeable. | Publish a versioned action order, units, control rate, reset semantics and success definition. Do not label our 25 axes a Shadow Hand. |
| [Gymnasium tactile manipulation documentation](https://robotics.farama.org/v1.2.2/envs/shadow_dexterous_hand/manipulate_block_touch_sensors/), description | Contact-derived touch channels have spatial definitions and force semantics. | Start with per-link object contact impulses. These are ideal solver outputs, not physical tactile arrays, pressure maps or EMG channels. |
| [MuJoCo computation documentation](https://mujoco.readthedocs.io/en/stable/computation/index.html), soft-contact and dynamics sections | Contact models make different approximations; friction and compliance affect control and identification. | Verify force balance and sensitivity. A new renderer cannot establish physical realism; compare engines on identical contact tests before migration. |
| [Learning Dexterous In-Hand Manipulation, 2018](https://arxiv.org/abs/1808.00177), author abstract | Learned reorientation was transferred to a physical Shadow Hand. | Simulation success alone is insufficient. Calibrated dynamics, observation noise, latency and held-out physical trials are required for transfer claims. |
| [Isaac Lab official documentation](https://isaac-sim.github.io/IsaacLab/main/), overview | Provides robot-learning infrastructure with accelerated simulation. | Browser Rapier is useful for interaction and small reproducible tests, not a substitute for large parallel policy training. |
| [ManiSkill official repository](https://github.com/mani-skill/ManiSkill), project overview | An integrated manipulation simulator/benchmark supports multiple embodiments and tasks. | Separate model, task, controller and renderer; retain headless operation and versioned assets. |
| [YCB object/benchmark paper](https://people.eecs.berkeley.edu/~pabbeel/papers/2015-RAM-YCB-object-set.pdf), benchmark motivation and protocol sections | Shared objects and explicit protocols support meaningful comparison. | Start with controlled primitives, then license-checked YCB assets, documented mass/inertia/collision approximations and held-out object splits. |
| [Rapier contact-manifold API](https://rapier.rs/javascript3d/classes/TempContactManifold.html), API and installed 0.19.3 declarations | Exposes contact impulses and solver contact points. | Report normal impulse divided by the fixed physics timestep as a step-average normal-force estimate; separate hand contact from floor contact. |

These are source-level comparisons, not experiments against those platforms. Preprint/abstract evidence is identified above; no third-party model assets or trained weights are copied.

## Gap and priority audit

| Priority | Missing capability | Why it matters | Completion gate |
| --- | --- | --- | --- |
| P0 | Direct independent actuator commands, typed state and deterministic episodes | Existing finger synergies conceal individual joints; slider interaction is not a controller API | Stable 25-axis manifest, bounded finite actions, fixed 20 Hz control over 120 Hz physics, seeded reset, explicit termination/truncation |
| P0 | Contact observability and object parameters | Contact count cannot distinguish support, impact or grasp | Hand/floor attribution, timestep/units documented, mass/radius/friction configuration, resting-weight regression |
| P1 | Real robot models and actuator dynamics | Present masses, carrier bodies and servo gains are engineering assumptions | Select robot; import licensed URDF/MJCF; validate transforms/inertia, torque/velocity limits, transmissions and measured step responses |
| P1 | Manipulation suite and controller baselines | Joint tracking does not demonstrate grasping | Reach, grasp-retain, lift, reorient and perturbation tasks with fixed starts, failure criteria and released traces; no false success from floor support |
| P1 | Reference engine adapter | Browser backend lacks a robotics training ecosystem | MuJoCo adapter reproduces a common manifest and golden trajectories; characterize differences rather than demand bitwise cross-engine equality |
| P2 | Calibrated tactile/vision observations | Perfect simulator state can leak information unavailable to a robot | Distinguish privileged training state and deployable observations; add calibrated noise, delay, missing packets and contact geometry |
| P2 | Learning and dataset pipeline | No policies, demonstrations or robust generalization evidence | Gymnasium wrapper; fixed train/validation/test seeds and objects; behavioral cloning/PPO baselines, compute budget and full failure reporting |
| P2 | Object library and contact calibration | A single sphere does not cover manipulation | Sphere/box/cylinder calibration then YCB subsets; friction/compliance sweeps, penetration/energy checks and held-out tests |
| P3 | Sim-to-real and independent comparison | “Best” is undefined without tasks and evidence | Pre-register task set and tolerances; compare success confidence intervals, pose error, slip/drop rates, throughput and setup effort on matched hardware |

## Execute now: foundation milestone

1. Keep the thesis workspace and its four-sEMG/one-IMU acquisition scope. Add a separately labeled robotics laboratory; virtual solver observations must never enter acquired sensor logs.
2. Add validated direct joint-angle overrides to the existing motor-driven solver. Preserve smoothing and joint limits, and retain coordinated manual controls when overrides are absent.
3. Add configurable spherical contact-object mass, radius and friction. Rebuild the model when applying settings. Expose per-link contact impulse/step-average normal load with explicit floor separation.
4. Provide a headless JavaScript environment with reset/step/close, seeded joint-tracking goals, radians in observations, normalized actions, reward and explicit success/time-limit results. Include a goal-aware servo baseline and neutral baseline. This is a controller plumbing benchmark, not a learned manipulation policy.
5. Verify invalid inputs, deterministic repeat runs, independent PIP/DIP targets, contact attribution and static weight balance. Export reproducible baseline results and inspect the browser controls. Publish a PR and preview.

## Subsequent work packages

Milestone 3 software delivery: [grasp-retention benchmark](MANIPULATION_BENCH.md), with seeded starts, fixture release, scheduled disturbance, contact eligibility and 100 held-out trials per baseline. Both baselines dropped all test objects. Reliable grasp control, lift and reorientation remain open research work.

Milestone 2 software delivery: [Allegro model package](ALLEGRO_MODEL.md). The pinned BSD-licensed reference model has a separate browser lab, resolved manifest, MuJoCo pose/mass-matrix fixtures, bounded simulation drives and 64 response checks. Hardware calibration and certified actuator limits remain open; this does not close the physical validation gate below.

- **Model package:** agree a physical robot/asset license; publish a manifest of joint frames, inertias, collision geometry and actuation. Measure calibration data before fitting parameters. Keep the present illustrative hand as its own named model.
- **Manipulation package:** add controlled object starts, grasp-retention without floor support, perturbations and reference controllers. Record success over at least 100 prespecified test seeds per condition with Wilson intervals; track dropped objects and timeout failures separately.
- **Backend package:** prototype MuJoCo offline before engine replacement. Match units, actuator semantics and observations; run gravity, free-fall, resting-contact, friction-slide, restitution, joint-limit and trajectory tests at multiple timesteps. Report discrepancies and runtime on named hardware.
- **Learning package:** expose a true Gymnasium Python interface to the robotics backend; freeze splits, observation privileges and evaluation budgets. Add demonstrations, policy replay and failure inspection before expensive training.
- **Validation package:** acquire safe bench recordings for selected hardware, estimate parameters on training trials, and assess held-out trajectories/contacts. Set tolerances before testing. Physical testing and purchase decisions require actual hardware details.

## Research questions and reporting

R1: Can repeatable controller episodes remain independent of rendering? R2: How sensitive are retention and slip to timestep, friction, compliance and actuator saturation? R3: Which model/observation calibration changes improve held-out physical transfer? R4: Does CoachSim reduce experiment setup and failure-analysis time compared with existing tooling?

Maintain a versioned ledger of model/solver/build, seeds, actual sampled parameters, task rules, controller identity, outcomes and raw traces. Never optimize on the final test set. Publish failures and uncertainty. Proposed “best” targets are a future scorecard across fidelity, task success, reproducibility, throughput and usability—not a single visual ranking or an unsupported current claim.
