# Continuous surface and joint inspector verification

Verified 26 September 2026. The interrupted work was present on disk; no source recovery was needed. The production build succeeds. A sandbox filesystem restriction initially prevented the local preview server from reading its configuration; starting it with the required filesystem permission succeeded. This does not establish the cause of the unspecified error previously seen by the user.

## Delivered

- Five closed continuous digit meshes, each with 1,178 vertices and 2,352 triangles. Tapered profiles include palmar fullness, rounded tips and a blend into the proximal carrier at the knuckle. Normalized, antipodal-corrected dual-quaternion blending follows the solved rigid poses. Surface geometry remains separate from collision geometry.
- Eight individually arranged schematic carpal shapes replace a uniform sphere grid. Carpals remain fixed to the palm core; their dimensions and placements are not scan-derived. Nail geometry follows each distal link.
- Opaque surface mode hides internal bone/joint display meshes. Anatomy mode reveals them. A joint inspector offers all 25 solver connections, their parent and limits, and an in-scene axis/range/current-angle overlay. The thumb and wrist approximations are stated directly in the interface.
- All six workspaces, four sEMG channels, one IMU, manual placement, IMU observation, benchmark trials and exports remain available.

## Checks

- Full test suite: 39 passed. Following the final knuckle attachment refinement, all four affected surface tests passed again.
- Surface tests verify rigid transform reproduction, quaternion sign invariance, preservation of radius in a blended twist, closed consistently oriented topology, bind-pose reproduction, invariance under arbitrary global placement, and finite vertices/normals under full curl/spread/opposition/cupping.
- Production rebuild passed. Existing Vite/dependency notices and the large hand-engine bundle warning remain.
- Local browser: opaque power curl and transparent inverted anatomy displayed successfully; selecting index PIP and thumb CMC populated the inspector and updated the overlay. No browser error logs were reported during these checks.

The tests do not establish soft-tissue volume conservation, absence of all surface intersections, physiological force accuracy or participant-specific anatomy. Skinning is geometric display deformation. The unchanged physics uses rigid colliders and motor torques, not muscle/ligament forces. See the [paper-informed plan](../docs/ANATOMY_SURFACE_PLAN.md) for sources, reading scope and implementation limits.
