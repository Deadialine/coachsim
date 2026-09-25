import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { DIGITS, worldPoint } from "./physics.mjs";
import { createPalmSurface } from "./palmSurface.mjs";

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
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
      detail: [0.2, 0.16, 0.36],
    };
    const palm = model.bodies.deviation;
    const target = worldPoint(palm, {
      x: 0,
      y: which === "detail" ? 0.065 : -0.03,
      z: 0,
    });
    orbit.target.set(target.x, target.y, target.z);
    const offset = new THREE.Vector3(...positions[which]);
    offset.y -= which === "detail" ? 0.075 : -0.035;
    offset.applyQuaternion(palm.rotation());
    camera.position.copy(orbit.target).add(offset);
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
      color: "#d7ad91",
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      roughness: 0.85,
      side: THREE.DoubleSide,
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
    markerSites = [],
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
    const geometry =
      material === materials.bone
        ? new THREE.LatheGeometry(
            [
              [0, 0],
              [0.72, 0.025],
              [1.05, 0.08],
              [0.85, 0.16],
              [0.58, 0.3],
              [0.52, 0.65],
              [0.7, 0.83],
              [1, 0.93],
              [0.85, 0.98],
              [0, 1],
            ].map(
              ([width, t]) => new THREE.Vector2(r * width, length * (t - 0.5)),
            ),
            20,
          )
        : new THREE.CapsuleGeometry(r, Math.max(0, length - 2 * r), 8, 20);
    const m = mesh(
      geometry,
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
      const wristSurface = mesh(
        new THREE.SphereGeometry(1, 24, 16),
        materials.shell,
        g,
        vec(point(0, 0, 0)),
      );
      wristSurface.scale.set(0.022, 0.014, 0.014);
      shellMeshes.push(wristSurface);
      for (const [x, y] of [
        [0.026, 0.08],
        [0.008, 0.087],
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
      markerSites.push({
        id: "imu",
        objects: [markers.at(-3), markers.at(-2), axes],
      });
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
        markerSites.push({
          id: `emg_ch${i + 1}`,
          objects: [electrode, markers.at(-1)],
        });
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
      if (link.id === "thumb_CMC") {
        const thenar = mesh(
          new THREE.SphereGeometry(1, 24, 16),
          materials.shell,
          g,
          vec(point(b.x * 0.36, b.y * 0.36, -0.003)),
        );
        thenar.scale.set(0.014, 0.023, 0.013);
        thenar.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vec(b).normalize(),
        );
        shellMeshes.push(thenar);
      }
      if (link.kind === "metacarpal")
        label(
          `${link.id.startsWith("ring") ? "IV" : "V"} CMC · palm arch`,
          g,
          point(-0.025, 0.012, 0.016),
        );
      shellMeshes.push(
        mesh(
          new THREE.SphereGeometry(shape.radius * 1.015, 20, 14),
          materials.shell,
          g,
        ),
      );
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
  fixed.position.copy(model.bodies.base.translation());
  fixed.quaternion.copy(model.bodies.base.rotation());
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
    new THREE.Vector3(0, model.floorY, 0),
  );
  ground.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(1.3, 26, "#34505d", "#233c49");
  grid.position.y = model.floorY + 0.001;
  scene.add(grid);
  const worldAxes = new THREE.AxesHelper(0.07);
  worldAxes.position.set(-0.14, 0, 0);
  scene.add(worldAxes);
  label("World XYZ", worldAxes, point(0, -0.025, 0));
  const collisionLines = new THREE.Group();
  const collisionObjects = [];
  const collisionMaterial = new THREE.LineBasicMaterial({
    color: 0x7bffd8,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });
  for (const link of model.links.filter((l) => l.kind !== "pivot")) {
    const c = link.collider;
    const half = link.shape.type === "box" ? c.halfExtents() : null;
    const geometry = half
      ? new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2)
      : new THREE.CapsuleGeometry(c.radius(), c.halfHeight() * 2, 4, 8);
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 12),
      collisionMaterial,
    );
    geometry.dispose();
    lines.renderOrder = 15;
    collisionLines.add(lines);
    collisionObjects.push({ lines, collider: c });
  }
  scene.add(collisionLines);
  const gravityArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-0.18, 0.08, 0),
    0.12,
    0x73dcca,
    0.026,
    0.012,
  );
  scene.add(gravityArrow);
  label("World gravity", gravityArrow, point(0, 0.02, 0));
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  const trails = [...DIGITS, "thumb"].map((digit, i) => {
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: [0x73e1cb, 0x79bbfa, 0xc2a2ff, 0xf3c484, 0xf09aa8][i],
        transparent: true,
        opacity: 0.8,
      }),
    );
    line.frustumCulled = false;
    trailGroup.add(line);
    return { digit, line, points: [] };
  });
  const tendonGroup = new THREE.Group();
  const connection = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: "#7fffe0",
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  connection.renderOrder = 20;
  connection.frustumCulled = false;
  scene.add(connection);
  const palmSurface = createPalmSurface();
  const palmSkin = mesh(palmSurface.geometry, materials.shell, scene);
  palmSkin.frustumCulled = false;
  shellMeshes.push(palmSkin);
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
    draw(options = {}, interpolate = true) {
      worldAxes.visible = !!options.axes;
      collisionLines.visible = !!options.colliders && !options.observation;
      if (collisionLines.visible)
        for (const { lines, collider } of collisionObjects) {
          lines.position.copy(collider.translation());
          lines.quaternion.copy(collider.rotation());
        }
      if (options.observation) {
        const center = worldPoint(model.bodies.deviation, point(0, 0.065, 0));
        const delta = new THREE.Vector3(center.x, center.y, center.z).sub(
          orbit.target,
        );
        camera.position.add(delta);
        orbit.target.add(delta);
      }
      const poseBody = (body) => {
        const pose = model.renderPose(body, interpolate);
        return {
          translation: () => pose.position,
          rotation: () => pose.rotation,
        };
      };
      for (const site of markerSites) {
        const placement = options.layout?.find((s) => s.id === site.id);
        if (!placement) continue;
        if (site.id === "imu") {
          const x = ((placement.x - 50) / 100) * 0.045,
            y = 0.012 + ((100 - placement.y) / 100) * 0.05;
          site.objects[0].position.set(x, y, 0.018);
          site.objects[1].position.set(x + 0.05, y, 0.025);
          site.objects[2].position.set(x, y, 0.022);
        } else {
          const x = ((placement.x - 50) / 50) * 0.022,
            y = 0.035 + ((100 - placement.y) / 100) * 0.18;
          const z =
            Math.sqrt(Math.max(0, 0.026 ** 2 - x ** 2)) *
            (placement.surface === "palmar" ? -1 : 1);
          site.objects[0].position.set(x, y, z);
          site.objects[0].quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(x, 0, z).normalize(),
          );
          site.objects[1].position.set(x * 2, y, z * 1.8);
        }
      }
      for (const link of model.links) {
        const g = groups.get(link.id);
        const pose = model.renderPose(link.body, interpolate);
        g.position.copy(pose.position);
        g.quaternion.copy(pose.rotation);
      }
      fixed.position.copy(model.bodies.base.translation());
      fixed.quaternion.copy(model.bodies.base.rotation());
      fixed.visible = !options.observation;
      ball.visible = !options.observation && !options.trial;
      gravityArrow.visible = !!options.gravity && !options.observation;
      trailGroup.visible = !!options.trails;
      for (const trail of trails) {
        if (!options.trails) {
          trail.points = [];
          continue;
        }
        const link = model.links.find(
          (l) =>
            l.id === `${trail.digit}_${trail.digit === "thumb" ? "IP" : "DIP"}`,
        );
        const tip = link.shape.offset
          ? point(link.shape.offset.x * 2, link.shape.offset.y * 2, 0)
          : point(0, link.shape.length, 0);
        const p = vec(worldPoint(poseBody(link.body), tip));
        if (
          !trail.points.length ||
          p.distanceTo(trail.points.at(-1)) > 0.00015
        ) {
          trail.points.push(p);
          if (trail.points.length > 600) trail.points.shift();
          trail.line.geometry.setFromPoints(trail.points);
        }
      }
      const ballPose = model.renderPose(model.ball, interpolate);
      ball.position.copy(ballPose.position);
      ball.quaternion.copy(ballPose.rotation);
      connection.visible = !!options.focus;
      if (options.focus) {
        const tipId =
          options.focus === "thumb" ? "thumb_IP" : `${options.focus}_DIP`;
        let link = model.links.find((l) => l.id === tipId);
        const chain = [];
        if (link) {
          const tip = link.shape.offset
            ? point(link.shape.offset.x * 2, link.shape.offset.y * 2, 0)
            : point(0, link.shape.length, 0);
          chain.push(vec(worldPoint(poseBody(link.body), tip)));
          while (link) {
            chain.push(vec(poseBody(link.body).translation()));
            link = model.links.find((l) => l.body === link.parent);
          }
        }
        connection.geometry.setFromPoints(chain);
      }
      const palmPose = poseBody(model.bodies.deviation);
      const names = ["little", "ring", "middle", "index"];
      const bases = [-0.035, -0.012, 0.008, 0.032].map((x) =>
        vec(worldPoint(palmPose, point(x * 0.55, 0.002, 0))),
      );
      const heads = names.map((name, i) => {
        const l = model.links.find((l) => l.id === `${name}_spread`);
        return vec(
          worldPoint(
            poseBody(l.body),
            point(i === 0 ? -0.007 : i === 3 ? 0.007 : 0, -0.004, 0),
          ),
        );
      });
      const q = model.renderPose(model.bodies.deviation, interpolate).rotation;
      palmSurface.update(
        bases,
        heads,
        new THREE.Vector3(0, 0, 1).applyQuaternion(
          new THREE.Quaternion(q.x, q.y, q.z, q.w),
        ),
      );
      materials.shell.opacity = options.opacity ?? 0.24;
      materials.shell.depthWrite = materials.shell.opacity >= 0.95;
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
          const spreadLink = model.links.find(
            (l) => l.id === `${digit}_spread`,
          );
          const baseWorld = worldPoint(
            poseBody(spreadLink.body),
            point(0, 0, side * 0.01),
          );
          const pts = [
            worldPoint(
              poseBody(model.bodies.deviation),
              point((DIGITS.indexOf(digit) - 1.5) * -0.01, 0.012, side * 0.014),
            ),
            baseWorld,
            ...links.map((l) =>
              worldPoint(poseBody(l.body), point(0, 0, side * 0.01)),
            ),
            worldPoint(
              poseBody(links[2].body),
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
