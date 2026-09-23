# Simulation refinement: evidence and assumptions

Reviewed 22 September 2026. This is an engineering visualization, not a participant-specific musculoskeletal model. Four forearm sEMG channels and one MPU6050 remain the study configuration. No new sensor, classifier, clinical outcome, or measured dataset is claimed.

## Literature reviewed

| Primary study | Access and relevant finding | Implementation decision |
| --- | --- | --- |
| [Darling, Cole & Miller (1994), Coordination of index finger movements](https://pubmed.ncbi.nlm.nih.gov/8188728/) | Abstract reviewed. Joint recordings and fine-wire EMG show coordinated index-finger motion; coordination involves muscle activity, not only passive restraints. | Retain coordinated MCP/PIP/DIP targets, but do not describe a fixed curl ratio as an anatomical law. |
| [Influence of Wrist Position on the Metacarpophalangeal Joint Motion of the Index Through Small Finger](https://pmc.ncbi.nlm.nih.gov/articles/PMC6436119/) | Full text reviewed, including methods, results, and limitations. The 31-person experiment used electrogoniometry with IP joints stabilized and found wrist-dependent MCP motion envelopes. The discussion describes wrist extension with finger flexion and the converse. | Add an optional qualitative wrist–finger coupling control. Do not transplant the paper's constrained-task ROM values into universal joint limits. |
| [Caumes et al. (2019), Complex couplings between joints, muscles and performance: the role of the wrist in grasping](https://pmc.ncbi.nlm.nih.gov/articles/PMC6920170/) | Indexed full-text methods/discussion and PubMed abstract reviewed; direct full-page retrieval was intermittently blocked. The study combines grip measurements and musculoskeletal modeling across wrist postures. | Show target versus solved angle. Do not infer grip force or muscle force from angle or synthetic EMG: that requires substantially more modeling and validation. |

## What changed

**Smooth command response.** A critically damped second-order command filter replaces constant-rate target ramps: acceleration = clamp(100 × angle error − 20 × command velocity, ±600 degrees/s²). Velocity is limited to ±120 degrees/s. Integration runs at 120 Hz; commands remain within joint limits. These are interface/controller choices, not measured neural dynamics. Rapier still computes actual body motion and contact; filtered commands never directly set body rotations.

**Display interpolation.** Rendered translations and normalized shortest-path quaternion blends interpolate the previous and current solved poses. This removes fixed-step visual stair-stepping with at most one physics-step display delay (8.33 ms). Pausing displays the current solved pose. Ball placement resets its interpolation history. Diagnostics always report solved values. Hidden workspace tabs and hidden browser documents skip rendering and physics advancement, preserving the model.

**Optional wrist–finger coupling.** The default is zero, preserving independent controls and study-posture demonstrations. At gain g, the four long-finger curl commands become clamp(c + g × (0.18 − wrist_angle/70 × 0.3) × (1 − c), 0, 1). The wrist angle is the solved relative flexion angle; negative means extension. The constants are illustrative assumptions, not regression coefficients from these papers. Curl still maps to MCP/PIP/DIP targets of 80/100/66 degrees, and spread decreases with curl. The thumb is not included in this approximation.

This illustrates the direction of tenodesis through motor targets. It is **not a passive tendon-force model**, and motors-off does not simulate passive tenodesis. There are no tendon moment arms, muscle activation dynamics, force–length curves, ligament constitutive laws, or subject calibration. Full tissue mechanics remain future work requiring suitable anatomical data and independent validation.

**Inspection and interface.** All six workspaces remain available. A consistent navigation/header, clearer trace cards, responsive controls, and live movement response cards improve readability. The complete joint table separates final target, filtered command, and actual angle, making controller lag distinguishable from physical tracking error. Logs, gates, exports, raw-signal generation, and placement snapshots retain their existing behavior.

## Validation scope

Automated checks cover reversal acceleration/velocity bounds, settled commands, zero-gain equivalence, coupling direction under solved wrist movement, physical constraints, interpolation, and ball-history reset. Existing posture, collision, timestep, session, signal-quality, and export tests also run. These checks establish software behavior, not biological validity. Hardware acquisition and participant validation remain outstanding.
