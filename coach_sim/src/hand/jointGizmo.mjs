import * as THREE from "three";
import { jointAngle, worldPoint } from "./physics.mjs";
export function createJointGizmo(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.LineBasicMaterial({
    color: 0xf3c484,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const arc = new THREE.Line(new THREE.BufferGeometry(), material);
  const pointer = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x79ffe0, depthTest: false }),
  );
  const axis = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    0.042,
    0x79bbfa,
    0.008,
    0.004,
  );
  for (const o of [arc, pointer, axis]) {
    o.renderOrder = 25;
    group.add(o);
  }
  let selected = null,
    basis = null,
    direction = null;
  return {
    update(link, pose) {
      group.visible = !!link;
      if (!link) return;
      if (selected !== link.id) {
        selected = link.id;
        direction = new THREE.Vector3(
          link.axis.x,
          link.axis.y,
          link.axis.z,
        ).normalize();
        basis = new THREE.Vector3(
          Math.abs(direction.y) < 0.9 ? 0 : 1,
          Math.abs(direction.y) < 0.9 ? 1 : 0,
          0,
        )
          .cross(direction)
          .normalize()
          .multiplyScalar(0.027);
        axis.setDirection(direction);
        arc.geometry.setFromPoints(
          Array.from({ length: 65 }, (_, i) =>
            basis
              .clone()
              .applyAxisAngle(
                direction,
                ((link.range[0] + ((link.range[1] - link.range[0]) * i) / 64) *
                  Math.PI) /
                  180,
              ),
          ),
        );
      }
      const parent = pose(link.parent),
        anchor = worldPoint(
          {
            translation: () => parent.position,
            rotation: () => parent.rotation,
          },
          link.anchor,
        );
      group.position.copy(anchor);
      group.quaternion.copy(parent.rotation);
      pointer.geometry.setFromPoints([
        new THREE.Vector3(),
        basis
          .clone()
          .applyAxisAngle(direction, (jointAngle(link) * Math.PI) / 180),
      ]);
    },
  };
}
