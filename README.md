# CoachSim

[Run CoachSim](coach_sim/README.md). The default app is the Fall 2026 simulation experiment. Open **Hand mechanics** (`?view=hand`) for the articulated 3D hand, or enable the optional posture illustration inside a session.

The model has five digits, 23 constrained rotational axes, gravity, motor torques, object contact, and hand self-contact. [Model assumptions and current sensor scope](docs/HAND_MODEL.md) · [Numerical verification](evidence/HAND_VERIFICATION.md).

Current scope: four MyoWare RAW sEMG channels targeting 2 kHz/channel and one MPU6050 targeting 100 Hz. Signals and recognition overlays remain synthetic. The hand is an engineering illustration, not a validated reconstruction of participant motion.

[Research evidence and protocol](https://github.com/Deadialine/Coachsim-phase1-design).
