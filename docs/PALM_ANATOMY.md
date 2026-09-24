# Articulated palm and anatomical display

## Why the palm changed

The earlier model grouped all four long-finger metacarpals into a rigid palm. The ring and little-finger chains now connect through separate fourth and fifth carpometacarpal (CMC) hinges. Moving them shifts the whole finger base, allowing a transverse palm arch instead of bending only the phalanges.

Primary literature reviewed:

- [A method for defining carpometacarpal joint kinematics from three-dimensional rotations of the metacarpal bones captured in vivo using computed tomography (2013)](https://pubmed.ncbi.nlm.nih.gov/23809760/). The available abstract/indexed text describes a single-subject CT study and fourth/fifth CMC functions for a metacarpal arch. Direct PMC full-text access was blocked. It motivates segmentation, not population-wide parameter estimates.
- [Cocchiarella et al. (2016), Toward a realistic optoelectronic-based kinematic model of the hand](https://pubmed.ncbi.nlm.nih.gov/26158485/). Abstract reviewed. Eight participants and three postures were compared using different metacarpal segmentation models; segmentation changed accessory MCP rotations. This supports representing palm motion explicitly rather than attributing all observed motion to the knuckles.

## Implemented mechanics

- 25 constrained rotational axes, increased from 23. Ring/little chain: palm core → CMC → MCP spread carrier → MCP flexion → PIP → DIP. Index and middle metacarpals remain fixed to the palm core. Thumb mechanics remain a separate two-axis CMC plus MCP/IP chain.
- Each new CMC uses an illustrative normalized local axis (−0.8, −0.6, 0). Limits: ring 0–20°, little 0–30°. Full cupping commands 12°/22°. These are engineering choices, not a reproduction of the cited CT coordinate system or measured subject anatomy.
- The palm's previous 280 g is redistributed into a 200 g core and two 40 g metacarpal links. The core collider is narrower; each moving metacarpal has a capsule collider. Neighboring anatomical connections retain existing contact exclusions, while other hand links retain self-contact. Dimensions, inertia, friction, and motor gains remain uncalibrated.
- Cupping is a motor command with the existing smooth command filter. Actual motion is solved by Rapier under gravity and contact. It is independently adjustable; Power curl and Cupped grasp supply illustrative combined targets. Opening the hand or applying a study posture resets cupping.

## Display

Bone meshes have tapered shafts and broader ends. A closed palm envelope follows the solved metacarpal bases/heads, with finger joint envelopes to improve continuity. Anatomy view is translucent; Surface view is opaque; Tendon guide view exposes the schematic flexor/extensor paths. A hand-detail camera makes the fingers and palm prominent, with full forearm views still available. Selecting a digit draws its physical connection chain in mint, including the new CMC links.

The display surface is not a finite-element soft-tissue simulation and is not the collision mesh. It may differ from capsule contact envelopes and overlap at tightly flexed joints. Tendon lines remain visual guides, not force-generating or collision-aware tendon paths. The eight carpal shapes still move as one cluster; radioulnar translations, ligaments, subject-specific muscle forces, and true thumb saddle-joint translations are not solved. This improves structural fidelity without establishing anatomical or clinical validity.

The four-channel sEMG / one-MPU6050 experiment, coaching gates, recordings, and exports are unchanged. No hand angle is presented as a measured sensor value.
