# Anatomical visualization upgrade — 25 September 2026

Plan recorded before implementation in response to the request for another paper-informed 3D upgrade.

## Evidence and decisions

- [Kavan et al., Skinning with Dual Quaternions, 2007](https://users.cs.utah.edu/~ladislav/kavan07skinning/kavan07skinning.pdf): geometric skinning blends rigid transforms while avoiding the collapse associated with linear matrix blending. Implement normalized dual-quaternion blending for continuous digit envelopes, driven by solved body poses. This is a graphics method, not a tissue constitutive model. Paper sections on geometric methods and blending reviewed.
- [Hollister et al., 1992](https://onlinelibrary.wiley.com/doi/abs/10.1002/jor.1100100319): seven cadaver thumbs had nonorthogonal, nonintersecting CMC axes. Publisher abstract reviewed. [Crisco et al., in-vivo TMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4306611/) reports additional coupled rotation/translation; indexed abstract reviewed, full text blocked by a browser challenge. Expose the current solver axes and limits rather than suggesting the simplified thumb is a fitted anatomical joint. Do not transplant population means into this uncalibrated hand.
- [In-vivo metacarpal kinematics study](https://pmc.ncbi.nlm.nih.gov/articles/PMC3788642/): the indexed abstract describes fourth/fifth CMC motion and formation of the palm arch in one subject. Preserve the moving ring/little metacarpals and the palm envelope that follows their solved poses. This small study does not establish our exact dimensions or motion limits.

## Implementation

1. Replace the segmented finger/thumb display capsules with closed, tapered continuous envelopes. Bind to the actual rigid links, use antipodal-corrected dual-quaternion blending around interphalangeal joints, recompute shading normals, and retain opaque surface / transparent anatomy modes. Keep the collision model inspectable and unchanged.
2. Replace the uniform carpal grid with individually named, schematically arranged carpal shapes; improve fingertip pads and nail alignment. Shapes and placement remain illustrative, not scan-derived anatomy. Carpals remain attached to the rigid palm core.
3. Add a joint inspector with a world-positioned solver axis, range arc, current-angle pointer, and textual parent/child/range information. Show model assumptions in context, especially at the thumb CMC and wrist.
4. Verify bind-pose reproduction, quaternion sign equivalence, rigid transform equivariance, mesh connectivity/finite normals and high-flexion poses. Run existing physics tests and check surface, anatomy and inspector modes in the browser at multiple placements. Publish code, evidence and preview on GitHub.

## Boundaries

No new sensor channels, finger reconstruction, muscle forces, ligament forces, moving individual carpals or deformable contacts are introduced. Surface intersections under extreme flexion are possible; graphics quality does not validate joint mechanics. Real-data fitting and a musculoskeletal backend require a separate validated model and acquisition evidence.
