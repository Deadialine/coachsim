import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { multiply, inverse, vector, sub } from "./model.mjs";
export async function createRobotScene(host, model, assetRoot, signal) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10232b");
  const camera = new THREE.PerspectiveCamera(35, 1, 0.002, 5);
  camera.position.set(0.4, 0.27, 0.43);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Allegro V3 right robot hand with source CAD geometry and simulated joints. Drag to orbit.",
  );
  host.appendChild(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.065, 0);
  orbit.minDistance = 0.18;
  orbit.maxDistance = 1;
  orbit.enableDamping = true;
  scene.add(new THREE.HemisphereLight("#e2fff5", "#44546b", 2));
  const light = new THREE.DirectionalLight("#fff3df", 3);
  light.position.set(0.4, 0.8, 0.5);
  scene.add(light);
  const rim = new THREE.DirectionalLight("#67c5ce", 2);
  rim.position.set(-0.4, 0.1, -0.2);
  scene.add(rim);
  const grid = new THREE.GridHelper(0.5, 20, "#3b6266", "#243e47");
  grid.position.y = -0.12;
  scene.add(grid);
  const materials = {
    metal: new THREE.MeshStandardMaterial({
      color: "#8da3ac",
      metalness: 0.55,
      roughness: 0.35,
    }),
    tip: new THREE.MeshStandardMaterial({
      color: "#d5e5dd",
      metalness: 0.02,
      roughness: 0.85,
    }),
    collision: new THREE.MeshBasicMaterial({
      color: "#6cf0d6",
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    }),
  };
  const groups = [],
    geometries = new Set(),
    cache = new Map(),
    loader = new STLLoader();
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    0.045,
    0xf5be73,
    0.009,
    0.004,
  );
  scene.add(arrow);
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  function dispose() {
    resize.disconnect();
    orbit.dispose();
    geometries.forEach((g) => g.dispose());
    Object.values(materials).forEach((m) => m.dispose());
    grid.geometry.dispose();
    (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(
      (m) => m.dispose(),
    );
    arrow.line.geometry.dispose();
    arrow.cone.geometry.dispose();
    arrow.line.material.dispose();
    arrow.cone.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  try {
    for (const { definition: b, body } of model.links) {
      const group = new THREE.Group();
      scene.add(group);
      const visual = new THREE.Group(),
        collision = new THREE.Group();
      group.add(visual, collision);
      groups.push({ group, visual, collision, body });
      for (const g of b.geoms) {
        let geometry,
          position = g.position,
          rotation = g.rotation;
        if (g.type === "mesh") {
          if (!cache.has(g.file)) {
            const response = await fetch(`${assetRoot}assets/${g.file}`, {
              signal,
            });
            if (!response.ok) throw Error(`Cannot load ${g.file}`);
            const geom = loader.parse(await response.arrayBuffer());
            geom.computeVertexNormals();
            cache.set(g.file, geom);
            geometries.add(geom);
          }
          geometry = cache.get(g.file);
          rotation = multiply(g.rotation, inverse(g.meshRotation));
          position = sub(g.position, vector(rotation, g.meshPosition));
        } else if (g.type === "box")
          geometry = new THREE.BoxGeometry(...g.size.map((v) => v * 2));
        else if (g.type === "capsule") {
          geometry = new THREE.CapsuleGeometry(g.size[0], g.size[1] * 2, 6, 12);
          geometry.rotateX(Math.PI / 2);
        } else geometry = new THREE.SphereGeometry(g.size[0], 16, 12);
        geometries.add(geometry);
        const mesh = new THREE.Mesh(
          geometry,
          g.collision
            ? materials.collision
            : g.rgba[0] > 0.5
              ? materials.tip
              : materials.metal,
        );
        mesh.position.copy(vector(b.bindRotation, position));
        mesh.quaternion.copy(multiply(b.bindRotation, rotation));
        (g.collision ? collision : visual).add(mesh);
      }
    }
    const bounds = new THREE.Box3();
    for (const g of groups) {
      g.group.position.copy(g.body.translation());
      g.group.quaternion.copy(g.body.rotation());
      g.group.updateMatrixWorld(true);
      bounds.union(new THREE.Box3().setFromObject(g.group));
    }
    const center = bounds.getCenter(new THREE.Vector3()),
      radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    const aspect = host.clientWidth / Math.max(1, host.clientHeight),
      fitAngle = Math.min(
        (camera.fov * Math.PI) / 360,
        Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect),
      );
    orbit.target.copy(center);
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.7, 0.35, 0.9)
          .normalize()
          .multiplyScalar((radius / Math.sin(fitAngle)) * 1.12),
      );
    return {
      draw({ colliders = false, selected = 0 } = {}) {
        for (const g of groups) {
          g.group.position.copy(g.body.translation());
          g.group.quaternion.copy(g.body.rotation());
          g.collision.visible = colliders;
          g.visual.visible = !colliders;
        }
        const j = model.joints[selected];
        arrow.position.copy(j.body.translation());
        arrow.setDirection(
          new THREE.Vector3().copy(vector(j.parent.rotation(), j.axis)),
        );
        orbit.update();
        renderer.render(scene, camera);
      },
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
