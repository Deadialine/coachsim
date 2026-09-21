# Hand mechanics verification

Date: 2026-09-21. All results below are software simulation, not hardware or participant evidence.

## Automated solver checks

`npm test` in `coach_sim` passed all 14 tests: eight existing experiment/data-integrity tests and six hand-physics tests. Each posture scenario below ran 600 fixed steps (5 simulated seconds) from a fresh world with default gravity and motor settings. Reported values are maxima over all steps and joints, not just the final frame.

| Scenario                                            | Maximum joint-anchor gap (mm) | Maximum limit overshoot (°) |
| --------------------------------------------------- | ----------------------------: | --------------------------: |
| Neutral rest                                        |                        0.0026 |                      0.0034 |
| Wrist flexion                                       |                        0.0029 |                      0.0034 |
| Wrist extension                                     |                        0.0029 |                      0.0046 |
| Radial deviation                                    |                        0.0050 |                      0.0170 |
| Ulnar deviation                                     |                        0.0032 |                      0.0031 |
| Forearm pronation                                   |                        0.0026 |                      0.0034 |
| Forearm supination                                  |                        0.0026 |                      0.0034 |
| Full five-digit curl and thumb opposition           |                        0.0086 |                      0.0030 |
| Combined wrist/forearm limits, index and thumb curl |                        0.0096 |                      0.0474 |

Acceptance thresholds in the regression tests are <0.5 mm maximum anchor separation and <1° maximum limit overshoot. The seven study presets settle within 3° of each requested wrist/forearm angle. Target errors are expected under load and when self-contact obstructs a curl.

Additional assertions verify:

- One supported tree with 23 constrained rotation axes and positive moving masses.
- Motor commands do not teleport the hand; the wrist reaches its target without gravity and moves when motors are released under gravity.
- Identical fixed-step outcomes when advancing with 30 versus 60 render frames/s, plus bounded work after a long background interval.
- Ballistic ball motion, contact at the expected floor height, and changed ball momentum after hand contact.
- Nonadjacent hand self-contact, excluded adjacent wrist contact, and intact anchors during an obstructed curl.

The tests intentionally do not assert physiological accuracy. They also do not certify arbitrary parameter changes or every possible trajectory. The executable tests in `coach_sim/tests/hand.test.mjs` are the source of truth if results change.

## Build and browser

The Vite production build passed. The default application JavaScript is approximately 178 kB (60 kB gzip); the shared physics/rendering chunk is approximately 2.77 MB (972 kB gzip), loaded only when 3D is requested. No model data is sent to a server.

Browser verification in the Codex in-app browser confirmed the five-digit model renders, Power curl changes the coordinated controls, the Index curl slider independently reaches 100%, Dorsal/Palmar camera presets work, Wrist flexion requests 45°, Pause exposes Resume, Reset restores the model, and tendon paths can be enabled. The experiment panel rendered alongside acquisition at 2 kHz/channel and 100 Hz IMU, switched to the stable-prediction source, and displayed **No reliable posture — neutral illustration** when clipping was injected. After stopping, seeking the replay cursor to zero restored the initial forearm-supination target.

Screenshots: [hand workspace](hand-workspace.png) and [experiment integration](hand-experiment.png). Screenshots show the numerical model and synthetic data only.

Rapier's compatibility package emits an initialization deprecation warning internally despite using its documented zero-argument `init()` entry point. This is a library warning, not a failed initialization. The build also reports the expected large lazily loaded WebAssembly/rendering chunk. Neither warning is evidence of physiological validation.
