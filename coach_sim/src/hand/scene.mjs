import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { DIGITS, worldPoint } from "./physics.mjs";

export function createScene(host, model) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101f2c");
  scene.fog = new THREE.Fog("#101f2c", 1.8, 3.5);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive right hand and forearm physics model. Drag to orbit, scroll to zoom. Use the controls beside the model to move joints.",
  );
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.tabIndex = 0;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
  });
  host.appendChild(labels.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.minDistance = 0.3;
  orbit.maxDistance = 1.8;
  function view(which = "dorsal") {
    const positions = {
      dorsal: [0.31, 0.21, 0.73],
      palmar: [-0.27, 0.14, -0.72],
      side: [0.72, 0.1, 0.03],
    };
    camera.position.set(...positions[which]);
    orbit.target.set(0, -0.035, 0);
    orbit.update();
  }
  view();
  scene.add(new THREE.HemisphereLight("#cfeeff", "#35495b", 2.8));
  const key = new THREE.DirectionalLight("#fff0d6", 4);
  key.position.set(0.45, 0.65, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.5;
  key.shadow.camera.right = 0.5;
  key.shadow.camera.top = 0.5;
  key.shadow.camera.bottom = -0.5;
  key.shadow.camera.near = 0.05;
  key.shadow.camera.far = 2;
  key.shadow.bias = -0.00015;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#69d4cf", 2);
  rim.position.set(-0.4, 0.3, -0.5);
  scene.add(rim);
  const materials = {
    bone: new THREE.MeshStandardMaterial({ color: "#efe2c6", roughness: 0.48 }),
    joint: new THREE.MeshStandardMaterial({
      color: "#d6a86b",
      roughness: 0.38,
      metalness: 0.15,
    }),
    shell: new THREE.MeshStandardMaterial({
      color: "#97b9b8",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 0.65,
    }),
    sensor: new THREE.MeshStandardMaterial({
      color: "#5de1c6",
      emissive: "#124b44",
      roughness: 0.4,
    }),
    board: new THREE.MeshStandardMaterial({
      color: "#eeb666",
      roughness: 0.45,
    }),
    support: new THREE.MeshStandardMaterial({
      color: "#314655",
      metalness: 0.35,
      roughness: 0.65,
    }),
  };
  const groups = new Map(),
    shellMeshes = [],
    markers = [],
    labelObjects = [];
  function mesh(geometry, material, parent, position) {
    const m = new THREE.Mesh(geometry, material);
    if (position) m.position.copy(position);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const vec = (p) => new THREE.Vector3(p.x, p.y, p.z),
    point = (x = 0, y = 0, z = 0) => ({ x, y, z });
  function boneBetween(a, b, r, parent, material = materials.bone) {
    const delta = vec(b).sub(vec(a)),
      length = delta.length();
    const m = mesh(
      new THREE.CapsuleGeometry(r, Math.max(0, length - 2 * r), 6, 12),
      material,
      parent,
      vec(a).add(vec(b)).multiplyScalar(0.5),
    );
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return m;
  }
  function label(text, parent, pos) {
    const el = document.createElement("span");
    el.className = "anatomy-label";
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.copy(vec(pos));
    parent.add(obj);
    labelObjects.push(obj);
    return obj;
  }
  for (const link of model.links) {
    const g = new THREE.Group();
    scene.add(g);
    groups.set(link.id, g);
    if (link.kind === "pivot") {
      mesh(new THREE.SphereGeometry(0.0055, 16, 12), materials.joint, g);
      continue;
    }
    const shape = link.shape;
    if (link.kind === "palm") {
      for (const [x, y] of [
        [0.026, 0.08],
        [0.008, 0.087],
        [-0.012, 0.083],
        [-0.03, 0.072],
      ]) {
        boneBetween(point(x * 0.48, 0.014, 0), point(x, y, 0), 0.006, g);
        mesh(
          new THREE.SphereGeometry(0.007, 16, 12),
          materials.joint,
          g,
          vec(point(x, y, 0)),
        );
      }
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 4; col++) {
          const carpal = mesh(
            new THREE.SphereGeometry(0.0075, 12, 10),
            materials.bone,
            g,
            vec(point((col - 1.5) * 0.012, 0.005 + row * 0.012, 0)),
          );
          carpal.scale.set(1, 0.8, 0.9);
        }
      shellMeshes.push(
        mesh(
          new THREE.BoxGeometry(0.075, 0.081, 0.025),
          materials.shell,
          g,
          vec(point(0, 0.042, 0)),
        ),
      );
      markers.push(
        mesh(
          new THREE.BoxGeometry(0.019, 0.023, 0.006),
          materials.board,
          g,
          vec(point(0, 0.024, 0.018)),
        ),
      );
      markers.push(
        label("MPU6050 · dorsal hand", g, point(0.055, 0.021, 0.025)),
      );
      const axes = new THREE.AxesHelper(0.037);
      axes.position.set(0, 0.024, 0.022);
      g.add(axes);
      markers.push(axes);
    } else if (link.kind === "forearm") {
      boneBetween(point(0.013, 0.005, 0), point(0.014, 0.242, 0), 0.009, g);
      shellMeshes.push(
        mesh(
          new THREE.CapsuleGeometry(0.026, 0.188, 8, 24),
          materials.shell,
          g,
          vec(point(0, 0.12, 0)),
        ),
      );
      [
        [0.026, 0.11, 0.007],
        [-0.026, 0.12, 0.006],
        [0.012, 0.15, -0.024],
        [-0.011, 0.08, -0.024],
      ].forEach(([x, y, z], i) => {
        const electrode = new THREE.Group();
        electrode.position.set(x, y, z);
        electrode.lookAt(new THREE.Vector3(x * 3, y, z * 3));
        g.add(electrode);
        for (const dy of [-0.008, 0.008])
          mesh(
            new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 16),
            materials.sensor,
            electrode,
            new THREE.Vector3(0, dy, 0),
          ).rotation.x = Math.PI / 2;
        markers.push(electrode);
        markers.push(label(`EMG ${i + 1}`, g, point(x * 2.1, y, z * 2.2)));
      });
      label("Radius · axial rotation", g, point(0.066, 0.035, 0));
    } else {
      const a = point(),
        b = point(
          shape.offset?.x * 2 || 0,
          shape.offset?.y * 2 || shape.length,
          0,
        );
      boneBetween(a, b, shape.radius * 0.63, g);
      mesh(
        new THREE.SphereGeometry(shape.radius * 0.85, 16, 12),
        materials.joint,
        g,
      );
      shellMeshes.push(boneBetween(a, b, shape.radius, g, materials.shell));
      if (link.id.endsWith("_DIP") || link.id === "thumb_IP") {
        const nail = mesh(
          new THREE.SphereGeometry(1, 12, 8),
          materials.bone,
          g,
          vec(point(b.x * 0.72, b.y * 0.72, 0.006)),
        );
        nail.scale.set(0.004, 0.006, 0.001);
      }
    }
  }
  const fixed = new THREE.Group();
  fixed.position.set(0, -0.24, 0);
  scene.add(fixed);
  boneBetween(point(-0.013, 0, 0), point(-0.014, 0.236, 0), 0.0085, fixed);
  label("Ulna · fixed reference", fixed, point(-0.068, 0.035, 0));
  mesh(
    new THREE.CylinderGeometry(0.04, 0.045, 0.018, 32),
    materials.support,
    fixed,
    new THREE.Vector3(0, -0.01, 0),
  );
  mesh(
    new THREE.BoxGeometry(0.08, 0.037, 0.075),
    materials.support,
    fixed,
    new THREE.Vector3(0, -0.035, 0),
  );
  label("MCP", groups.get("index_MCP"), point(0.026, 0, 0.007));
  label("PIP", groups.get("index_PIP"), point(0.024, 0, 0.007));
  label("DIP", groups.get("index_DIP"), point(0.023, 0, 0.006));
  label("CMC", groups.get("thumb_CMC"), point(0.014, -0.016, 0.01));
  label("Wrist · 2 axes", groups.get("flex"), point(-0.065, 0, 0.006));
  const ball = mesh(
    new THREE.SphereGeometry(0.027, 32, 24),
    new THREE.MeshStandardMaterial({ color: "#e09b62", roughness: 0.55 }),
    scene,
  );
  ball.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.0272, 1)),
      new THREE.LineBasicMaterial({
        color: "#ffc994",
        transparent: true,
        opacity: 0.45,
      }),
    ),
  );
  const ground = mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshStandardMaterial({ color: "#152936", roughness: 1 }),
    scene,
    new THREE.Vector3(0, -0.295, 0),
  );
  ground.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(1.3, 26, "#34505d", "#233c49");
  grid.position.y = -0.294;
  scene.add(grid);
  const tendonGroup = new THREE.Group();
  scene.add(tendonGroup);
  const tendons = [];
  for (const digit of DIGITS)
    for (const side of [-1, 1]) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 5 }, () => new THREE.Vector3()),
        ),
        new THREE.LineBasicMaterial({
          color: side < 0 ? "#eb8e79" : "#79bde2",
          transparent: true,
          opacity: 0.8,
        }),
      );
      tendonGroup.add(line);
      tendons.push({ digit, side, line });
    }
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  return {
    view,
    draw(options = {}) {
      for (const link of model.links) {
        const g = groups.get(link.id);
        g.position.copy(link.body.translation());
        g.quaternion.copy(link.body.rotation());
      }
      ball.position.copy(model.ball.translation());
      ball.quaternion.copy(model.ball.rotation());
      shellMeshes.forEach((m) => (m.visible = options.shell !== false));
      labelObjects.forEach((m) => (m.visible = !!options.labels));
      markers.forEach(
        (m) =>
          (m.visible =
            !!options.sensors &&
            (!(m instanceof CSS2DObject) || !!options.labels)),
      );
      tendonGroup.visible = !!options.tendons;
      if (options.tendons)
        for (const { digit, side, line } of tendons) {
          const links = ["MCP", "PIP", "DIP"].map((k) =>
            model.links.find((l) => l.id === `${digit}_${k}`),
          );
          const base = model.links.find(
            (l) => l.id === `${digit}_spread`,
          ).anchor;
          const pts = [
            worldPoint(
              model.bodies.deviation,
              point(base.x * 0.4, 0.012, side * 0.014),
            ),
            ...links.map((l) => worldPoint(l.body, point(0, 0, side * 0.01))),
            worldPoint(
              links[2].body,
              point(0, links[2].shape.length, side * 0.006),
            ),
          ];
          line.geometry.setFromPoints(pts.map(vec));
        }
      orbit.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    },
    dispose() {
      resize.disconnect();
      orbit.dispose();
      const geometries = new Set(),
        mats = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            mats.add(m),
          );
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
