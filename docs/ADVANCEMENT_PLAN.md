# CoachSim advancement plan — 25 September 2026

Written before implementing this upgrade, following the request to compare similar online simulators and execute an improvement plan.

## Evidence-led comparison

This is a documentation review, not a head-to-head performance benchmark. Counts are version-specific; joint count alone does not establish fidelity.

| System / primary source | Demonstrated focus | Lesson for CoachSim |
| --- | --- | --- |
| [MyoSuite research paper, Caggiano et al. 2022](https://proceedings.mlr.press/v168/caggiano22a.html), [current model/task documentation](https://myosuite.readthedocs.io/en/latest/suite.html) | Muscle-actuated models and contact-rich tasks. Current myoHand documentation lists 29 bones, 23 joints and 39 muscle-tendon units; the original paper's count differs. | Use specified tasks and reproducible measurements. Physiological actuation needs an established model and validation, not renamed joint motors. |
| [OpenSim upper-extremity model](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53087772/Upper%2BExtremity%2BModel), [official wrist tutorial](https://github.com/opensim-org/opensim-models/blob/master/Tutorials/doc/Tutorial%2B2%2B-%2BSimulation%2Band%2BAnalysis%2Bof%2Ba%2BTendon%2BTransfer%2BSurgery.html) | Upper-extremity muscle geometry and analysis of muscle force, moment arms and tendon-transfer effects. | Anatomical calibration, model provenance and output-specific validation matter more than cosmetic realism. |
| [MuJoCo Menagerie Shadow Hand](https://github.com/google-deepmind/mujoco_menagerie/blob/main/shadow_hand/README.md) | A robotic hand with inertial specifications, collision exclusions and tuned object-contact behavior; Apache-2.0 assets. | Make collision representations inspectable and use controlled perturbations to evaluate responses. Robotic geometry is not a human anatomical substitute. |
| [MS-MANO, 2024 author preprint](https://arxiv.org/abs/2404.10227) | Combines a parametric hand model with musculoskeletal constraints for pose refinement. Abstract reviewed. | A realistic surface and mechanical constraints address different errors. Do not claim surface appearance proves force accuracy. |
| [emg2tendon, 2025 author preprint](https://arxiv.org/abs/2508.08269) | sEMG-to-tendon control research using MyoHand. Abstract reviewed. | EMG-to-motion inference requires data and learned/evaluated mappings. Our four-channel scope does not justify inferred finger control. |

## Scope to execute now

1. Add two deterministic software trials to the existing hand workspace: seven study-posture transitions, and recovery after a specified transverse palm impulse. Recreate the model at trial start, sample at the solver rate, record target/actual joint angles and numerical constraint metrics, and export full configurations and rows. Keep these software trials separate from participant sessions.
2. Add an orientation-reference evaluator. Accept timestamped unit quaternions, expose the clock offset, interpolate only within supported reference intervals, report coverage and angular error distributions, and retain all assumptions in exports. Include a clearly synthetic noisy-sensor example for exercising the evaluator; never label it participant validation.
3. Improve inspection with fingertip movement trails and response/error charts. Preserve all six workspaces and both manual/IMU modes. Freeze observation from an immutable articulated pose to avoid cumulative transform drift.
4. Verify determinism, disturbance application, quaternion sign equivalence, timing alignment, coverage rejection, interpolation, and error metrics. Check desktop/mobile UI and the deployed GitHub preview.

## Larger integration path

After reference data and the experiment's error tolerance are specified, compare the current estimator with VQF on identical held-out recordings. For muscle-force or tendon-mechanics questions, evaluate an offline MyoSuite/OpenSim backend with versioned model files, license review, joint-coordinate mapping and independent experimental validation. Import that backend's results into CoachSim before considering an interactive engine migration. Do not silently substitute a robotic hand or a licensed parametric human mesh.

The intended advantage is an accessible, auditable four-sEMG/one-IMU experiment workspace. Superiority over other platforms is not established by this review or upgrade; it would require a defined task set and independent comparative results.
