# Restored CoachSim workspace

The new 3D model is retained alongside the original workspace functions, updated to the current sparse EMG–IMU study. All tabs use one mounted experiment controller; changing tabs does not start a new session or navigate away from the page. The URL identifies the selected tab for bookmarking. Reloading still starts a new in-memory workspace: export before leaving or creating another session.

| Tab / address                  | Restored function                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Overview / `?view=overview`    | Session controls, acquisition summary, cue/prediction feedback, optional 3D illustration, replay                                    |
| Sensor Layout / `?view=layout` | Draggable palmar/dorsal diagram, arrow-key and numeric editing, four EMG sites plus dorsal-hand IMU, channel map                    |
| Signals / `?view=signals`      | Four raw EMG traces; acceleration X/Y/Z in g; angular velocity X/Y/Z in degrees/s; shared replay cursor                             |
| Coaching Logic / `?view=logic` | Live inputs, explicit quality/confidence/freshness/class/stability gates, decision state and feedback, fault injection              |
| Data Logs / `?view=log`        | Searchable events and timestamped operator notes, notes CSV, full session ZIP, latest raw rows, captured placement snapshot, replay |
| 3D Model / `?view=hand`        | Existing five-digit physics model, controls, cameras, joint inspection, and markers linked to the placement draft                   |

`?view=concept` opens Overview. Tabs support left/right arrow keys and Home/End. Sensor markers support arrow keys and numeric editing in addition to pointer dragging. The hand remains mounted after first visiting it, preserving the pose and camera; its physics pauses when the tab is hidden.

## Placement and annotations

The layout is a **draft for the next session**, expressed as percentages within a schematic forearm/hand region. It is not a measurement, calibration, or approved electrode-placement protocol. IMU placement remains on the dorsal hand. Unsupported sensors cannot be added. Edits update the 3D markers but do not change EMG generation, IMU generation, or joint mechanics.

Starting a simulation copies this draft into `session.placement_metadata.sites`, with `coordinate_system: schematic_region_percent`. Later edits never mutate an existing session's placement snapshot. An imported snapshot can seed the next-session draft. Data Logs exposes the actual recorded snapshot separately.

Notes are stored in `session.operator_notes` as `{t_us, text, target, kind: operator_annotation}`. Their timestamps use the current session/replay cursor. Each note has at most 1,500 characters, and a session accepts up to 500 notes. Notes survive version-2 ZIP roundtrips in `session.json`; no extra raw-data columns or fabricated sensor samples are introduced. Preparing a notes CSV creates a download link. Adding a note invalidates a previously prepared ZIP so the next export includes the annotation. Imported recordings retain their declared provenance.

## Coaching logic

The rule view and Overview use the same decision function. Feedback is withheld for failed raw/prediction quality, confidence below 70%, predictions older than 250 ms or from the future, or an unrecognized class. The label must remain stable for at least 250 ms before posture feedback is issued. A stable prediction that differs from the target yields **ADJUST**, never a success/hold cue. Matching predictions yield **HOLD** during cues; rest intervals yield **REST**. Other states are WAITING, UNCERTAIN, SETTLING, and COMPLETE.

The thresholds remain fixed to the study configuration rather than introducing untracked tuning. The restored rule view replaces the old heart-rate, respiration, force, and haptics demo rules with the current seven-posture protocol. Predictions and confidence remain synthetic; no classifier accuracy, medical safety, fatigue, or rehabilitation claim follows from the rule display.

## Verification

`npm test` runs 17 tests: the existing data and physics coverage plus tests for coaching gate precedence/target mismatch, layout constraints, and placement/annotation export roundtrips with unchanged sensor rows. `npm run build` builds the full workspace. Browser verification covers cross-tab session and pose continuity, all ten signal traces, notes/export controls, sensor editing, and clipped-signal uncertainty. See [workspace verification](../evidence/WORKSPACE_VERIFICATION.md).
