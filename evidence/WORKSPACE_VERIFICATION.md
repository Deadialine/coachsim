# Workspace restoration verification

Date: 2026-09-21. All sessions used synthetic test data.

## Automated checks

All **17 tests passed**, including the existing eight acquisition/bundle tests, six hand-physics tests, and three new workspace tests. The new tests verify:

- Coaching gate precedence, stable target mismatch producing ADJUST rather than HOLD, and rest/completion behavior.
- Operator notes with commas, quotes, and newlines and a frozen placement snapshot surviving the version-2 bundle roundtrip without changing raw EMG or IMU rows.
- Draft layout bounds, fixed dorsal IMU placement, and exclusion of unsupported sensor channels.

The Vite production build passed. The initial app bundle is approximately 192 kB (65 kB gzip); the existing physics/rendering code remains lazy-loaded.

## Browser checks

The final built app was tested using a local production preview, separate from development hot reload:

1. Opened Sensor Layout, changed EMG 1's draft X position to 64, and started a simulated session.
2. Switched to Signals: all ten traces were present (four EMG plus six IMU axes), and the same session continued.
3. Added an operator note, stopped the session at 11.3 simulated seconds, and prepared a notes CSV download link.
4. Changed the draft X position to 80. Data Logs still showed X=64 in the captured placement snapshot; the note and session remained present.
5. Applied Power curl in 3D Model, switched to Data Logs, and returned. Index curl remained 90% and the articulated scene continued without a browser console error.
6. Dragged the EMG 1 marker: the draft changed from X=80/Y=38 to approximately X=62/Y=48. Numeric and arrow-key editing were also verified.
7. Sought replay to time zero: the later operator note was absent. Sought to the end: the note returned. Coaching Logic correctly showed REST at that cursor.
8. Prepared the full session ZIP through the UI; the download link appeared. File-content roundtrip integrity is covered by the automated test.

During the development browser check, injecting clipping switched the rule view to UNCERTAIN and showed failed quality/confidence/class/stability gates. Clearing the fault resumed normal processing. Arrow-key sensor editing changed X=62 to X=64.

Screenshots:

- [Sensor layout](restored-sensor-layout.png)
- [Data logs and placement snapshot](restored-data-logs.png)
- [Coaching logic](restored-coaching-logic.png)
- [Preserved 3D model tab](restored-hand-tab.png)

These checks establish software behavior, not physical acquisition, anatomical calibration, physiological coaching, or trained-classifier performance. Reloading the entire page still starts a fresh in-memory session; users must export before leaving.
