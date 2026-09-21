# CoachSim browser validation

Executed 2026-09-21 against the local Vite development preview at http://127.0.0.1:5173/ using the Codex in-app Chromium browser. Screenshots in this folder are local demonstration evidence, not evidence of a hosted deployment or physical device operation.

## Verified interactions

- Start simulation: IDs become read-only, virtual session time advances, EMG reports 2000 rows/s, IMU sample count advances, the randomized cue and countdown change.
- Live traces: all four EMG channels and IMU acceleration contain rendered data. The simulated prediction follows posture changes and reaches the stable state.
- Inject clipping fault: ADC rails appear, the quality warning activates, confidence drops to 20%, overlay becomes uncertain, and fault_on is logged. Clearing the fault logs fault_off and returns the stream to its nominal range.
- Stop: recording stops, export and replay become available, and a timestamped stop event is retained.
- Export: the ZIP action executes and the UI returns from its busy state. ZIP content roundtrip is independently validated by the Node tests; no browser download file path was exposed by this session.
- Import full bench archive: four-channel-600s.zip loaded successfully. At the replay endpoint the UI showed 600.0 s, 60,000 IMU samples, 2000 EMG rows/s, zero missing/clipped fractions, synchronized traces, target and prediction, and events at 0, 300 and 600 s. The browser control call timed out while the large import processed; the subsequent UI confirmed success.
- UI visual review: the available narrow viewport wraps controls and metrics without horizontal overflow. The full-page screenshot records the vertically stacked layout.

## Automated validation

Eight Node tests pass for schedules, full-resolution multirate generation, ZIP roundtrip, schema validation, v1 migration, raw-signal gating, confidence/staleness/stability behavior, and CSV handling. The production Vite build passes. Three Python bench tests and separate nominal/negative packet-accounting assertions pass in the design repository.

The browser does not connect to physical hardware or execute a trained classifier. Large archives are processed synchronously and can temporarily block the UI. The inherited package tree reports dependency advisories; no broad dependency migration was attempted during this research feature change. The verification workflow builds and uploads a static artifact but does not publish a hosted site.
