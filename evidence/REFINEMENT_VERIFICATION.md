# Hand simulation and interface refinement verification

22 September 2026. All results are software simulation checks, not hardware or participant validation.

- 21 automated tests passed (existing 17 plus 4 motion/interpolation tests).
- Production build passed. Existing Vite/dependency advisories and the large lazy-loaded physics/graphics chunk warning remain. The existing Rapier initialization deprecation warning remains; no application errors were found in the browser checks.
- Across nine posture/extreme-curl scenarios, maximum joint-anchor separation was 0.0059 mm and maximum limit overshoot was 0.0336 degrees. These are numerical solver diagnostics, not anatomical accuracy.
- Command reversals respect the tested 120 degrees/s velocity and 600 degrees/s² acceleration bounds in the command filter; the command settles at its target. Joint limit clamping remains an additional safeguard.
- With optional coupling enabled, solved wrist extension increases long-finger curl and flexion reduces it; constraints remain within test tolerances. With gain zero, independent curl commands are unchanged.
- Display interpolation falls between solved poses, preserves normalized rotations, and does not mutate simulation state. Ball placement resets display history.
- Browser test on the production build: coupling slider, extension preset, palmar/side camera views, pause, all-joint telemetry, and switching from hand to Overview/Signals and back worked. Paused movement feedback was identical before and after switching tabs. Starting a session still produced four raw EMG and six IMU traces.
- Responsive check at 390 × 844 caught an intrinsic canvas-width overflow; `min-width: 0` on the stage/control grid children corrected it. After correction, document width was 375 pixels within a 390-pixel viewport (scrollbar excluded). Temporary viewport override was reset.
- Screenshot: [refined hand workspace](refined-hand-workspace.png).

Research rationale and explicit approximations: [Simulation refinement](../docs/SIMULATION_REFINEMENT.md). No signal-generation or trained-classifier changes are included in this update. The existing synthetic-data provenance, coaching quality gates, logs, export/import, and placement tests continue to pass.
