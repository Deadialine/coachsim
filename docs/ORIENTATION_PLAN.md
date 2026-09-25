# Arbitrary-orientation research lab — implementation plan

Requested 24 September 2026. Support both manual placement and recorded/live IMU orientation, preserving all six existing workspaces.

1. Audit coordinate frames. Keep world gravity separate from anatomical joint coordinates. Add normalized quaternion placement, consistent initialization of every body, and world-referenced diagnostics. Static setup changes reset dynamics explicitly; camera movement never changes physical orientation.
2. Verify upright, inverted, horizontal, and oblique placements. Check joint connectivity, bounded angles, gravity response, rotational equivalence with gravity disabled, and fixed-step determinism. Save machine-readable results with thresholds and configuration.
3. Provide manual pose presets and arbitrary three-axis placement. Use a laboratory floor with clearance for every supported arm orientation. Keep the support, ulna drawing, sensor markers, and display layers in the same frame. Add world/gravity cues and pose-aware framing.
4. Implement recorded IMU CSV and an opt-in live serial input path using a documented raw-sample protocol. A six-axis orientation estimator requires gyro-bias and gravity initialization, mounting calibration, timing/quality rejection, and explicit relative-heading limitations. Test known synthetic rotations, invalid data, and timing gaps.
5. Keep physics and IMU pose viewing distinct. A single dorsal-hand IMU provides hand orientation, not individual finger angles, forearm orientation, or position. IMU viewing holds the articulated pose and anchors hand position while reorienting it; it does not claim inverse dynamics or measured finger movement. Physics resumes from a fresh manual setup.
6. Improve lighting, framing and inspection, and export simulation setup / IMU estimates with provenance and units. Document software verification separately from biological validation and specify the reference-measurement experiment required next.
7. Run automated checks, production build, desktop/mobile browser checks, and deployment verification. Push a reviewable GitHub PR; do not claim clinical/anatomical validation from software tests.

Evidence basis: ISB joint-coordinate reporting recommendations (Wu et al., 2005), verification/validation best practices (Hicks et al., 2015), and quaternion-based inertial orientation literature (Laidig & Seel, 2023). Implementation details and accessible sources will be recorded with the final evidence.
