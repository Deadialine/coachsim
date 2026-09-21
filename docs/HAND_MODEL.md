# CoachSim articulated hand model

The 3D Model tab at `?view=hand` replaces the earlier box-and-three-finger model within the restored six-tab workspace. The old `?view=concept` address opens Overview. The experiment remains the default route. Its optional **Show 3D posture illustration** panel follows either the target cue or a stable, quality-gated prediction without leaving the session. The full hand tab preserves its pose while other tabs are used and pauses physics while hidden.

This is an engineering rigid-body model, not a validated musculoskeletal or patient-specific model. No measured EMG-to-force, EMG-to-angle, inverse-kinematics, or trained recognition model is implemented. The existing synthetic experiment data retain their original provenance. Model angles are not exported as acquired sensor measurements.

## Connections and coordinates

The supported right forearm connects to a two-axis wrist and a rigid palm. Four fingers each have MCP flexion and spread, PIP flexion, and DIP flexion. The thumb has two CMC axes, MCP flexion, and IP flexion: **23 rotational degrees of freedom** in total. Compound joints use serial revolute constraints with small virtual carrier bodies. Each body is connected by local joint anchors; rendering reads the solved body transforms rather than setting them from slider values.

Initial coordinates are metres, +Y toward the fingertips, +X toward the thumb, +Z dorsal. Positive flexion rotates about −X toward the palm (−Z); positive radial deviation rotates about −Z toward the thumb. The forearm rotation axis is +Y. The supination/pronation labels denote positive/negative rotation relative to the model's reference pose, not an anatomically calibrated neutral frame. The ulna drawing stays at the fixed reference and the radius drawing follows the rotating forearm body. This illustrates the axial relationship; it does not model radioulnar translations or the changing radius–ulna contact geometry.

The eight carpal shapes and four finger metacarpal shapes are rigidly attached to the palm. They are anatomical landmarks, not eight independently simulated carpal bodies. The thumb metacarpal is independently articulated. The palm collision surface is a box; phalanges and the forearm use capsules. The translucent surface shows these approximate collision envelopes.

## Selected parameters

These are explicit engineering assumptions for an adult-sized demonstration, not normative clinical measurements or individually fitted values. Joint limits are numerical constraints with finite solver tolerance, not tissue failure limits.

| Motion                       | Selected limits       |
| ---------------------------- | --------------------- |
| Forearm rotation             | −80° to +80°          |
| Wrist flexion/extension      | −70° to +70°          |
| Wrist ulnar/radial deviation | −35° to +20°          |
| Finger MCP spread            | −20° to +20°          |
| Finger MCP flexion           | −10° to +90°          |
| Finger PIP flexion           | 0° to 110°            |
| Finger DIP flexion           | 0° to 80°             |
| Thumb CMC opposition axis    | 0° to 65°             |
| Thumb CMC second axis        | 0° to 40°             |
| Thumb MCP / IP flexion       | 0° to 60° / 0° to 80° |

Forearm length is 240 mm; palm envelope is 74 × 82 × 24 mm. Proximal/middle/distal phalanx lengths are index 41/24/19 mm, middle 45/28/21 mm, ring 42/27/20 mm, and little 32/20/17 mm. Thumb metacarpal/proximal/distal lengths are 38/30/24 mm. Forearm moving mass is 0.85 kg; palm mass is 0.28 kg. Each finger's moving phalanges have masses 25/14/9 g. Thumb link masses are 35/25/14 g. Virtual carriers contribute 35 g at the wrist, 8 g per MCP spread axis, and 12 g at the thumb CMC. Mass distribution and inertia are approximate; carrier inertia stabilizes the compound-joint representation.

Finger curl is a coordinated command: MCP = 80 × curl, PIP = 100 × curl, DIP = 66 × curl (degrees). This is a selected motion synergy, not a universal tendon law. Thumb curl commands CMC/MCP/IP = 30/55/70 × curl. The thumb opposition control remains independent. Spread decreases with curl. Optional blue/red tendon paths are schematic extensor/flexor guides for the four fingers; they generate no forces and are not collision-aware tendon routing.

## Dynamics and contact

- Three.js 0.181.2 renders the model; Rapier 0.19.3 solves its dynamics in WebAssembly. Both versions are locked.
- Fixed timestep: 1/120 s; 32 solver iterations and 4 internal PGS iterations. Length scale 0.1 m gives a nominal allowed contact penetration of 0.1 mm. Continuous collision detection is enabled on dynamic segments and the ball.
- Gravity is −9.81 m/s² along world Y. A fixed support anchors the forearm reference. Switching off motors leaves the joints constrained but freely responding to gravity and contact.
- Force-based PD motors produce joint torques. The base stiffnesses are 20 N·m/rad for the three wrist/forearm axes and 0.3 N·m/rad for other axes, multiplied by the displayed scale (default 4). Base damping is 1 or 0.012 N·m·s/rad, respectively, multiplied by the square root of the scale. These are numerical servo settings, not estimated muscle properties or physiological torque capacities. No muscle-specific torque saturation is claimed.
- Commands approach requested angles at no more than 120°/s, avoiding instantaneous command jumps. Actual angles result from the solver and may differ under load or contact.
- A 60 g, 27 mm radius ball has gravity, inertia, friction (0.9), and restitution (0.15). Hand friction is 0.85; floor friction is 0.8. These coefficients are assumed.
- Nonadjacent hand segments collide with each other, the ball, and the floor. Anatomically adjacent joint volumes are excluded from self-contact even when separated by a virtual axis carrier. Rapier contact hooks are applied through an event-enabled step. Contact readouts count ball pairs with solver contacts, not merely nearby broad-phase pairs.
- The render accumulator accepts at most 0.1 s per frame. Excess background-tab time is discarded and reported in the angle inspector. This prevents large catch-up bursts; physics time can lag wall time. It is separate from the acquisition/replay clock.

Reset creates a fresh world. Pause stops physics while allowing camera movement. The three camera presets, orbit/pan/zoom, surface, anatomical labels, sensor sites, and tendon guides support inspection. Physics and WebGL resources are disposed when the view unmounts. The large physics/rendering code is lazy-loaded so the default experiment does not download it until the optional 3D view is requested.

## Current study scope

The sensor display contains four bipolar **MyoWare RAW sEMG** channels targeting **2 kHz per channel** and one **MPU6050** targeting **100 Hz** on the dorsal hand/wrist. The interactive Sensor Layout draft updates the full 3D Model tab's markers. Electrode positions are schematic, not an approved placement map; editing them does not modify the synthetic signal generator or physical model. A session captures its own placement snapshot at start, separate from later draft edits. The IMU axes are attached to the palm; no magnetometer or absolute heading is assumed. **ESP32 acquisition is planned**, not connected or verified. **DS1307** is for wall-clock metadata only, not sample timing.

The seven classes remain neutral rest, wrist flexion, wrist extension, radial deviation, ulnar deviation, forearm pronation, and forearm supination. LDA is the planned primary classifier and RBF SVM the comparison, with separate-session evaluation. Trained recognition is not supplied by this visualization. Finger tracking, strain/FSR, respiration, PPG, haptics, and lower-limb sensing are outside the current study. The previous broad sleeve/leg controls and unused miniature renderer have been removed from active source code; historical evidence remains preserved.

## Validation and limits

Run `npm test` in `coach_sim`. See [verification results](../evidence/HAND_VERIFICATION.md). Tests cover topology, joint limits, frame-rate independence, motor dynamics, gravity release, ball momentum/contact, and self-contact. They establish numerical behavior for selected scenarios, not anatomical validity, muscle-force accuracy, tissue safety, or all possible poses.

The most important unmodeled effects are muscle activation and force-length/velocity behavior, ligament and tendon mechanics, tissue deformation, radioulnar translations, individual carpal mobility, and subject-specific calibration. The thumb saddle joint is approximated by hinges; its true axes and coupled translations are more complex. Clinical interpretation would require a different validation process and measured data.

## References informing the implementation

- [Rapier JavaScript joints and PD motors](https://rapier.rs/docs/user_guides/javascript/joints/) — solver and motor implementation.
- [Rapier impulse-joint API](https://rapier.rs/javascript3d/classes/UnitImpulseJoint.html) — angular limits and motor controls.
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) — camera inspection.
- [Hollister et al., The axes of rotation of the thumb interphalangeal and metacarpophalangeal joints (1995)](https://pubmed.ncbi.nlm.nih.gov/7586826/) — evidence that thumb flexion axes are anatomically more complex than aligned hinges.
- [Coordination of thumb joints during opposition (2006)](https://pubmed.ncbi.nlm.nih.gov/16643926/) — coupled thumb movements; supports explicitly labeling the implemented command synergy as a simplification.
- [Three-dimensional kinematic analysis of the second through fifth carpometacarpal joints (2001)](https://pubmed.ncbi.nlm.nih.gov/11721246/) — mobility omitted by the rigid-palm approximation.

These references inform topology and limitations. They do not validate the chosen dimensions, masses, limits, coefficients, or motor gains.
