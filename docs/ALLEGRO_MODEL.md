# Allegro model package — milestone 2

## Plan and acceptance gates

Import a pinned openly licensed reference robot without replacing the thesis hand. Resolve its complete body tree, CAD geometry, collision shapes, mass properties and actuator order with MuJoCo; independently check forward kinematics; simulate bounded actuator response in Rapier; provide a dedicated browser lab, response traces and provenance exports.

Software gates: all 21 body poses match three independently compiled MuJoCo fixtures within 1e-9 m and quaternion dot error 1e-9; 16 unique actuator mappings and finite positive physical inertias; source asset hashes retained; invalid commands rejected before advancing; applied drive torques never exceed the configured cap; command changes respect the configured rate. Target anchor drift is below 0.1 mm for four-second response checks. Report tracking errors across all 16 actuators and four placements, including failures. Tracking results are characterization, not a hardware accuracy gate.

Physical calibration is **pending**. No manufacturer torque/speed specification or measured link response is inferred from visual similarity.

## Source and derivation

- [MuJoCo Menagerie Allegro V3](https://github.com/google-deepmind/mujoco_menagerie/tree/71f066ad0be9cd271f7ed58c030243ef157af9f4/wonik_allegro), commit `71f066ad0be9cd271f7ed58c030243ef157af9f4`. Its README describes the source URDF conversion, position actuators, collision simplification and density scaling. Read the model XML and complete README/license.
- Original [SimLab URDF](https://github.com/simlabrobotics/allegro_hand_ros/blob/master/allegro_hand_description/allegro_hand_description_right.urdf) has zero effort/velocity placeholders, so those values are not interpreted as usable robot limits.
- BSD-2-Clause, copyright 2016 SimLab. Original XML, README, license and 11 STL assets are included in `coach_sim/public/models/allegro/`. License accompanies browser distributions. No meshes were artistically modified.
- `scripts/export-allegro.py` compiles the original XML with MuJoCo 3.6.0 and emits `manifest.json`. Install `mujoco==3.6.0` with Python 3.12 in a local environment to reproduce it. The compiler resolves default classes, rotations and inferred inertias. Mass/inertia comes from source visual-mesh density (800 kg/m³), not experimentally measured individual links. Sum of source body masses: approximately 0.6445 kg; the palm is fixed in our simulation.
- Manifest includes source SHA, compiler, SI units, file hashes, all body frames, COMs, principal inertia frames, visual and collision geometry, joint/control ranges, actuator names, source damping/gains and three reference poses. Hashes are asset integrity checks, not a security signature.

## Browser and solver behavior

Select **Allegro V3 · 16 actuators** in the 3D Model workspace, or use `?view=hand&model=allegro`. The engineering human hand remains separately selectable. Neither robot state nor virtual force enters the thesis acquisition streams. The 4 sEMG + 1 IMU study and six workspaces remain unchanged.

CAD and source collision geometry follow the same simulated bodies. Select an actuator to see its axis, angle, speed, command and applied torque. Choose upright, inverted, horizontal or palm-up mounting. The reference grid has no collision plane. The palm is fixed; nonexcluded finger links collide. No object manipulation task is included in this model package.

All Rapier body frames use the zero-pose world basis. Source geometry, COM and inertia frames are rotated into that basis; joint anchors and axes are transformed consistently. This permits different source rest rotations through Rapier's shared-axis revolute interface. Fixed fingertip bodies retain their mass/inertia and attach with fixed joints. Capsules convert source z axes to Rapier y axes. STL rendering undoes MuJoCo's internal mesh centering/principal-axis transform.

Physics runs at 240 Hz. Browser time accumulation is capped at 50 ms per frame, hidden/inactive time is discarded, and headless tests advance fixed steps without rendering. Rebuild on configuration changes; switching models resets the lab. Model home clamps zero into every joint range (thumb base starts at 0.263 rad).

## Actuation assumptions

The browser backend uses torque-limited implicit PD, with generalized mass assembled from each link's linear/angular Jacobians and source COM/inertia. We solve `(M + (dt Kd + dt² Kp) I) a = Kp(q_command − q − dt v) − Kd v`, then apply `tau = RHS − (dt Kd + dt² Kp) a`, clamped per joint, with equal/opposite torques on connected bodies. Commands slew at 2 rad/s by default; this is **not a hard bound on actual joint velocity**. Default torque cap 0.15 N·m, Kp 1 N·m/rad, Kd 0.02 N·m·s/rad are **software assumptions**, not manufacturer ratings. Source MuJoCo damping and position servos are recorded but not reproduced by this alternative controller.

The implicit formulation is informed by [Tan, Liu & Turk, Stable Proportional-Derivative Controllers](https://faculty.cc.gatech.edu/~turk/my_papers/stable_pd.pdf). Our implementation does not predict Coriolis, gravity or contact bias in the control law; the physics solver still applies gravity/contact. Saturation and contacts preclude an unconditional stability claim. This is not a claim of matching MuJoCo dynamic trajectories or physical Allegro firmware.

## Response protocol and remaining calibration

**Run actuator response test** starts a new model at home, holds for 1 s, then adds 0.4 rad to one actuator (clamped to its valid range) for 3 s. Other joints target home. Exports contain all 16 joint states and applied torques at 240 Hz, placement, gravity, drive assumptions, timestamps, source version, complete flag and error/saturation/anchor metrics. Manual controls cannot contaminate an active test. There is no pass/fail hardware label.

`node scripts/benchmark-allegro.mjs` runs all 16 actuators at four gravity orientations. [Evidence](../evidence/allegro-response-baselines.json) summarizes all 64 completed runs. [Compressed traces](../evidence/allegro-response-traces.json.gz) retain full 240 Hz proximal-joint records for each placement (gzip JSON). Repetition is deterministic, not 64 independent physical samples; confidence intervals would be inappropriate. The largest final absolute error is 0.05470 rad (3.134°); the largest anchor error is 0.002931 mm, below the 0.1 mm software gate. The controller has no gravity feedforward, so gravity-dependent offsets are expected and reported.

Independent articulated mass matrices also match MuJoCo at all three fixture poses within 1e-9 kg·m². This checks the imported inertia and hierarchy, not equivalence of contact solvers or dynamic trajectories.

Verification includes seven new automated checks (50 total with the existing suite), a production build, and browser checks for CAD rendering, independent commands, collision view, inverted mounting, response completion and switching back to the thesis hand. The browser download event could not be captured by the automation tool; export data and deterministic complete traces are checked headlessly. The response browser check reported −1.37° final error for upright index proximal, consistent with the headless result.

Future physical calibration needs identified robot revision, measured torque/current mapping, transmission/friction/backlash, delay, velocity limits and held-out response recordings. Do not fit against these synthetic tests and call it physical validation.
