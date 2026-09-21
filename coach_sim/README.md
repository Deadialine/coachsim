# CoachSim experiment workflow

The default screen implements the first four Fall 2026 thesis milestones as a simulation workflow. Six tabs share one session: Overview, Sensor Layout, Signals, Coaching Logic, Data Logs, and 3D Model. Start a seeded seven-posture session, inspect four raw EMG traces and all six IMU axes, inject a quality fault, add notes, export a versioned ZIP, and replay it. The articulated hand tab is at `?view=hand`; `?view=concept` opens the restored workspace's Overview.

The hand uses Three.js and Rapier rigid-body dynamics with five digits, 23 constrained axes, motor torques, gravity, object contact, and nonadjacent self-contact. Controls include seven study postures, individual finger curls, thumb opposition, spread, three camera views, and anatomical/sensor layers. Read [model assumptions](../docs/HAND_MODEL.md) and [verification](../evidence/HAND_VERIFICATION.md).

Enable **Show 3D posture illustration** in Overview to follow target cues or stable predictions. The full 3D Model tab keeps its pose and camera while you inspect other tabs, and pauses physics while hidden. The model follows illustrative posture targets, not measured joint angles. Its physics clock is independent of acquisition/replay time, and no simulated joint angles are inserted into session exports.

Sensor Layout edits the next session's draft. Starting a session copies the schematic sites into `session.json` under `placement_metadata.sites`; later draft edits never rewrite that snapshot. Data Logs adds timestamped `operator_notes` to the same file and provides a separate notes CSV. These optional metadata fields survive ZIP import/export without changing schema-v2 raw-data columns. See the [workspace guide](../docs/WORKSPACE.md).

Signals, confidence and latency in generated sessions are synthetic. There is no connected device and no trained classifier. Imported legacy logs preserve provenance; reserved v1 EMG is never promoted to raw EMG.

## Run and verify

Node.js 22 or later and npm are recommended. This is a Vite project, not Create React App.

```sh
npm ci
npm test
npm run dev -- --host 127.0.0.1
npm run build
npm run preview -- --host 127.0.0.1
```

Open the local URL printed by Vite. Enter simulation IDs and a nonnegative 32-bit seed; start a simulation. Each of eight blocks includes seven shuffled classes, 3 s cue and 3 s rest (336 s nominal). The browser uses a virtual clock; background throttling may slow wall-clock playback. It does not measure acquisition timing. Stop before exporting. Session data stays in memory until export; export before starting a new session or leaving the page.

Export produces a ZIP containing session.json, emg.csv, imu.csv, events.csv and predictions.csv. Full 2 kHz EMG and 100 Hz IMU rows are retained; charts show only short visible windows. Import accepts a four-channel v2 ZIP or an exact-header v1 CSV. One-channel bench variants are intentionally unsupported in this UI. Archives are limited to 80 MB compressed and 240 MB unpacked. Import/export can pause the UI while processing large files; offline tools are provided for larger datasets.

Replay advances one shared cursor for traces, target labels, predictions and events. Fault injection rails the generated ADC, reduces confidence and suppresses positive coaching. The overlay gates on confidence, freshness, raw signal quality and prediction stability. Synthetic overlay values are labeled `synthetic-overlay-1`; they do not estimate recognition accuracy.

## Research documentation

The [phase-one evidence repository](https://github.com/Deadialine/Coachsim-phase1-design) contains the system spec, schema, channel map, continuity audit, literature matrix, protocol, analysis plan, manuscript outline and synthetic bench reports. See its D1–D4 delivery index for the physical and hosting evidence that remains unverified.

Tests exercise data integrity, deterministic schedules, independent sample rates, ZIP roundtrip, v1 migration and uncertainty gates. Browser verification and screenshots are in ../evidence. No physical firmware or real-time transport has been certified by these tests.
