# CoachSim

[Run CoachSim](coach_sim/README.md). One shared session spans **Overview, Sensor Layout, Signals, Coaching Logic, Data Logs, and 3D Model**. Switching tabs preserves recording, replay, notes, and the hand pose. Open `?view=hand` directly for the articulated model, or enable the posture illustration in Overview.

The restored sensor editor supports dragging and keyboard/numeric placement. Session ZIPs retain the placement snapshot and timestamped operator notes. Signals exposes all four EMG channels and all six MPU6050 axes. Coaching Logic displays the live quality, confidence, freshness, stability, and target-match decision. [Workspace guide](docs/WORKSPACE.md).

The model has five digits, 25 constrained rotational axes, gravity, motor torques, object contact, and hand self-contact. [Model assumptions and current sensor scope](docs/HAND_MODEL.md) · [Numerical verification](evidence/HAND_VERIFICATION.md).

Current scope: four MyoWare RAW sEMG channels targeting 2 kHz/channel and one MPU6050 targeting 100 Hz. Signals and recognition overlays remain synthetic. The hand is an engineering illustration, not a validated reconstruction of participant motion.

[Arbitrary-orientation lab](docs/ORIENTATION_LAB.md): manual placement, calibrated IMU CSV playback, opt-in Web Serial input, and explicit measurement limits. [Orientation verification](evidence/ORIENTATION_VERIFICATION.md).

[Research evidence and protocol](https://github.com/Deadialine/Coachsim-phase1-design).
