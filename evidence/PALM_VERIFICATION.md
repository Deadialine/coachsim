# Articulated palm verification

Completed 23 September 2026. This verifies software behavior, not anatomical accuracy or hardware acquisition.

- All 23 automated tests passed, including new checks for the ring/little CMC connection hierarchy, palmward motion of the whole finger root, return after cupping, and a closed finite display mesh.
- Existing posture tests now include full cupping with full curl and combined extreme wrist/finger targets. Maximum observed joint-anchor error: 0.0072 mm. Maximum joint-limit overshoot: 0.0489 degrees. Collision, gravity, timestep independence, coaching, session export, and placement tests passed.
- Production build passed. Existing dependency/toolchain notices, Rapier initialization warning, and large lazy-loaded graphics chunk warning remain.
- Browser checks covered Cupped grasp, palm-cupping control, anatomy/surface modes, hand-detail and palmar cameras, digit connection tracing, and the 25-joint target/command/actual table. No application console errors were observed.
- Responsive check at 390 × 844: document width 375 pixels inside the viewport, with no page-level horizontal overflow. Camera buttons wrap and remain accessible. The temporary viewport override was reset.
- [Screenshot of the updated hand](articulated-palm.png).

See [anatomy rationale and assumptions](../docs/PALM_ANATOMY.md). The display envelope is not a soft-tissue physics model, and cupping parameters remain engineering assumptions. Study sensors and synthetic signal generation are unchanged.
