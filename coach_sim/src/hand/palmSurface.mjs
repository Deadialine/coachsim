import * as THREE from "three";

// A closed display envelope following the solved metacarpal frame. This mesh
// never supplies contact forces; collision remains on the rigid segments.
export function createPalmSurface() {
  const rows = 9,
    columns = 13,
    layer = rows * columns;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(layer * 2 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const indices = [];
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let side = 0; side < 2; side++)
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < columns - 1; c++) {
        const a = side * layer + r * columns + c;
        if (side === 0) quad(a, a + 1, a + columns + 1, a + columns);
        else quad(a, a + columns, a + columns + 1, a + 1);
      }
  for (let r = 0; r < rows - 1; r++) {
    const a = r * columns,
      b = a + columns - 1;
    quad(a, a + columns, a + columns + layer, a + layer);
    quad(b, b + layer, b + columns + layer, b + columns);
  }
  for (let c = 0; c < columns - 1; c++) {
    quad(c, c + layer, c + layer + 1, c + 1);
    const a = (rows - 1) * columns + c;
    quad(a, a + 1, a + 1 + layer, a + layer);
  }
  geometry.setIndex(indices);
  return {
    geometry,
    update(bases, heads, dorsal) {
      const baseCurve = new THREE.CatmullRomCurve3(bases),
        headCurve = new THREE.CatmullRomCurve3(heads);
      for (let c = 0; c < columns; c++) {
        const u = c / (columns - 1),
          a = baseCurve.getPoint(u),
          b = headCurve.getPoint(u);
        for (let r = 0; r < rows; r++) {
          const t = r / (rows - 1),
            center = a.clone().lerp(b, t);
          const thickness = 0.008 + 0.004 * Math.sin(Math.PI * t);
          for (let side = 0; side < 2; side++) {
            const p = center
              .clone()
              .addScaledVector(dorsal, side === 0 ? thickness : -thickness);
            const i = (side * layer + r * columns + c) * 3;
            positions[i] = p.x;
            positions[i + 1] = p.y;
            positions[i + 2] = p.z;
          }
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    },
  };
}
