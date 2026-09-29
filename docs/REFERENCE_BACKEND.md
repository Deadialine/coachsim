# Milestone 4: offline reference backend

## Plan frozen before evaluation

Add a Python MuJoCo 3.6.0 Allegro adapter alongside the Rapier 0.19.3 browser backend. Preserve the licensed source assets and existing browser behavior. Use the same 16 named actions, SI units, joint ranges, home pose, torque cap (0.15 Nm), target slew (2 rad/s) and implicit PD law. Remove source position actuators and passive damping from the comparison model in memory, because the browser does not reproduce them. No gravity or contact feedforward is added. Keep source XML unchanged.

Evaluate at 120, 240 and 480 Hz. Primitive fixtures use z-up, gravity 9.81 m/s², 30 g bodies and 25 mm sphere radius / box half-width. Hand fixtures use source coordinates and y-down gravity, identity mounting. Run free fall (0.2 s), resting sphere (2 s), nonrotating sliding box (1 s), and bounce response (1 s). Run hand drives-off gravity and zero-gravity, a proximal step command, and an upper-limit command (2 s each). Store full trajectories, matched-time discrepancies, timestep sensitivity, finite-state checks and measured wall time on a named CPU.

Software gates fixed before running: finite trajectories; bounded commanded torque; free-fall position error <10 mm; resting height error <5 mm and final vertical speed <0.05 m/s; no-gravity undriven joint drift <1e-5 rad; joint-limit penetration <0.05 rad. Report failures without changing gates. Trajectory differences, friction stopping distance and bounce height are characterization, not equivalence gates. Bounce parameters are intentionally engine-native: Rapier restitution 0.5 versus MuJoCo solref (0.02 s, damping ratio 0.2); these are not claimed equivalent. Normal contacts use MuJoCo solref (0.02, 1), solimp (0.9, 0.95, 0.001); Rapier uses its native solver. Friction is 0.5 on both primitive surfaces; MuJoCo uses condim 3, no torsional or rolling friction.

Deliver the adapter, reproducible scripts and evidence, automated Python validation in CI, and a documented decision about backend readiness. Do not claim physical calibration, engine superiority or a solved grasp task. The six thesis workspaces and 4-sEMG/1-IMU study stay unchanged.

## Delivered result and decision

The offline adapter and all 48 comparisons are implemented. **42 of 48 cases pass their applicable diagnostic gates; six fail.** These gates qualify physics behavior; they are separate from software regression tests. All trajectories are finite. The four Python adapter tests and 56 JavaScript regression tests pass, as does the app production build.

At 240 Hz:

| Diagnostic | Result |
| --- | --- |
| Driven proximal step | Cross-engine RMS angle difference 0.000232 rad; maximum 0.002260 rad across all 16 joints |
| Upper-limit command | Cross-engine RMS angle difference 0.000329 rad; maximum 0.007830 rad |
| Undriven hand under gravity | RMS angle difference 0.030964 rad; maximum 0.287617 rad |
| Rapier undriven, zero gravity | Maximum drift 0.00003509 rad, above the frozen 0.00001 rad tolerance |
| MuJoCo undriven, gravity on | Maximum joint-limit penetration 0.23810 rad, above the frozen 0.05 rad tolerance |
| Resting sphere height error | Rapier 0.374 mm; MuJoCo 0.367 mm |
| Box slide distance | Rapier 101.935 mm; MuJoCo 100.038 mm; ideal Coulomb reference 101.937 mm |

Rapier's zero-gravity drift gate fails at all three rates (maximum 0.00009523 rad at 480 Hz). MuJoCo's undriven-gravity limit gate also fails at all three rates (maximum 0.26517 rad at 480 Hz). Smaller timesteps do not uniformly improve these checks. The engines retain different limit/contact constraint formulations; removing source damping exposes an undamped falling-hand case, not a measured robot response. No limits or thresholds were changed after seeing results.

**Decision:** retain Rapier for browser use and use MuJoCo as an offline diagnostic reference. Do not replace the engine or claim dynamic equivalence yet. Next work should isolate limit stiffness/damping and float/constraint drift, then repeat the frozen checks alongside new cases. Manipulation retention, other mount orientations, contact-force equivalence, energy accounting, real hardware calibration and policy transfer have not been established by this milestone. The previous failed grasp-controller baseline remains unchanged.

## Adapter contract

`scripts/reference_backend.py` provides `AllegroReference(hz=240, gravity=True)`, `reset()`, `step(targets, enabled=True)` and `observe()`. Target arrays follow the 16 joint IDs in the committed Allegro manifest; inputs are finite, in-range radians and are validated before state changes. The constructor accepts only 120/240/480 Hz. `enabled=False` applies zero motor torque. `reset()` restores the source-valid home, zero velocities and time, command and applied effort.

Observations contain seconds, joint angles (`q`, rad), joint velocities (`v`, rad/s), the slewed command (rad), and the torque applied over the just-completed interval (Nm). These are privileged simulation observations, not sensor readings. A driven step uses the same implicit PD formula as the browser, with MuJoCo's compiled mass matrix in source actuator order. Engine state and generalized coordinates replace Rapier's independent rigid-body constraints; this is intentional, not a byte-identical simulator port.

The benchmark performs the proximal target change at 0.5 s; step targets 0.4 rad, limit targets the source upper bound. The palm remains fixed. No-gravity and gravity passive runs begin at home with drives disabled. Tests verify all three stored pose/inertia fixtures, asset mass and action order, atomic rejection of invalid inputs, deterministic reset, slew and torque limits, zero-gravity stillness and step response.

## Reproduction and evidence

From the repository root, install the app dependencies and the pinned Python packages in an isolated Python 3.12 environment. The adapter also recognizes the ignored `.model-tools` directory used for local source-model compilation; omit that directory when reproducing with a clean environment.

```sh
npm ci --prefix coach_sim
python -m pip install -r scripts/requirements-reference.txt
python scripts/test_reference_backend.py
python scripts/benchmark_backend_mujoco.py
node scripts/benchmark-backend-rapier.mjs
node scripts/compare-backends.mjs
```

[Readable results](../evidence/REFERENCE_BACKEND.md) and [machine-readable comparison](../evidence/backend-comparison.json) include every diagnostic result, RMS/max differences at matched timestamps, each engine's deviation from its own 480 Hz trajectory, normalized-LF source SHA-256 hashes, dependency versions and runtime. Both compressed trace files retain every physics sample in all 24 cases per engine. Primitive fields `p` and `v` are world xyz position in metres and linear velocity in m/s. Robot arrays use manifest actuator order. Time starts at the first completed physics step; initial conditions are in the protocol.

Published timing was measured on the same Intel Core i9-10900F CPU, Windows x64, Node 24.11.0, Python 3.12.14, NumPy 2.5.3. It includes observation/controller work and excludes model loading. These single runs have no warm-up/repetition control and do not establish an engine speed ranking. CI separately runs both engines on a Linux runner and publishes its own results as workflow artifacts; it does not overwrite the committed Windows evidence.

The comparison script rejects missing/duplicate cases, incomplete traces, nonfinite states and mismatched timestamps. Qualification failures are retained as failed diagnostic rows rather than made into passing tests. A green CI run means the adapter/tests/report pipeline works, **not** that every physics qualification gate passes.

## Research and implementation sources

- [MuJoCo 3.6 computation and contact model](https://mujoco.readthedocs.io/en/3.6.0/computation/): generalized dynamics, passive/applied forces, soft contact and constraint formulation. This motivates reporting discrepancies rather than calling either engine ground truth.
- [MuJoCo 3.6 function reference](https://mujoco.readthedocs.io/en/3.6.0/APIreference/APIfunctions.html): `mj_forward`, `mj_step`, `mj_fullM` and named model lookup underpin the adapter and fixture checks.
- [Rapier restitution documentation](https://rapier.rs/docs/user_guides/javascript/collider_restitution/): restitution coefficients and combination rules. MuJoCo damping ratio is not treated as the same quantity.
- [Pinned Allegro source and actuation assumptions](ALLEGRO_MODEL.md): BSD-licensed Menagerie asset provenance, compiled inertia and the implicit-PD reference. Source XML and CAD remain unmodified.
