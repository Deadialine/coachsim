console.log("[3D Visualization] module loaded");
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "./three-lite";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const defaultPose = {
  wrist: { flexion: 0, rotation: 0, fingers: [0, 0, 0] },
  leg: { knee: 0, ankle: 0 },
};

function useLerpedPose(targetPose) {
  const [pose, setPose] = useState(defaultPose);
  const targetRef = useRef(targetPose);

  useEffect(() => {
    targetRef.current = targetPose;
  }, [targetPose]);

  useEffect(() => {
    let raf;
    const step = () => {
      setPose((prev) => {
        const t = targetRef.current || defaultPose;
        const lerp = (a, b, k = 0.12) => a + (b - a) * k;
        return {
          wrist: {
            flexion: lerp(prev.wrist.flexion, t.wrist?.flexion ?? 0),
            rotation: lerp(prev.wrist.rotation, t.wrist?.rotation ?? 0),
            fingers: prev.wrist.fingers.map((f, i) =>
              lerp(f, t.wrist?.fingers?.[i] ?? 0, 0.2)
            ),
          },
          leg: {
            knee: lerp(prev.leg.knee, t.leg?.knee ?? 0),
            ankle: lerp(prev.leg.ankle, t.leg?.ankle ?? 0),
          },
        };
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return pose;
}

function buildWrist(scene, partsRef) {
  const group = new THREE.Group();
  group.position.set(-1.2, -0.2, 0);

  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3 })
  );
  forearm.position.set(0, 0, 0);

  const wristPivot = new THREE.Group();
  wristPivot.position.set(0.7, 0, 0);

  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.32, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 })
  );
  palm.position.set(0.3, 0, 0);

  const twist = new THREE.Group();
  twist.position.copy(wristPivot.position);

  const fingers = new THREE.Group();
  const fingerMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316 });
  [0, 1, 2].forEach((i) => {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.1), fingerMaterial);
    finger.position.set(0.6, 0.12 - i * 0.12, 0.14 - i * 0.08);
    finger.geometry.translate(0.16, 0, 0);
    finger.rotation.z = -0.3;
    fingers.add(finger);
    partsRef.current.fingers[i] = finger;
  });

  twist.add(palm);
  palm.add(fingers);
  wristPivot.add(twist);
  group.add(forearm);
  group.add(wristPivot);
  partsRef.current.wristPivot = wristPivot;
  partsRef.current.wristTwist = twist;
  return group;
}

function buildLeg(scene, partsRef) {
  const group = new THREE.Group();
  group.position.set(0.8, -0.6, 0);

  const thigh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x22c55e })
  );
  thigh.position.set(0, 0.6, 0);

  const kneePivot = new THREE.Group();
  kneePivot.position.set(0, 1.2, 0);

  const shin = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 1.1, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x16a34a })
  );
  shin.position.set(0, 0.55, 0);

  const anklePivot = new THREE.Group();
  anklePivot.position.set(0, 1.1, 0);

  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  );
  foot.position.set(0, 0.07, 0.25);

  anklePivot.add(foot);
  shin.add(anklePivot);
  kneePivot.add(shin);
  group.add(thigh);
  group.add(kneePivot);
  partsRef.current.kneePivot = kneePivot;
  partsRef.current.anklePivot = anklePivot;
  return group;
}

function applyPoseToScene(pose, partsRef) {
  if (!pose) {
    console.error("[3D Visualization] pose missing during transform", pose);
    return;
  }
  const { wrist, leg } = pose;
  if (partsRef.current.wristPivot) {
    partsRef.current.wristPivot.rotation.z = THREE.MathUtils.degToRad(wrist.flexion || 0);
  }
  if (partsRef.current.wristTwist) {
    partsRef.current.wristTwist.rotation.x = THREE.MathUtils.degToRad(wrist.rotation || 0);
  }
  (partsRef.current.fingers || []).forEach((finger, i) => {
    if (!finger) return;
    const angle = wrist.fingers?.[i] ?? 0;
    finger.rotation.x = THREE.MathUtils.degToRad(-angle);
  });
  if (partsRef.current.kneePivot) {
    partsRef.current.kneePivot.rotation.x = THREE.MathUtils.degToRad(-leg.knee || 0);
  }
  if (partsRef.current.anklePivot) {
    partsRef.current.anklePivot.rotation.x = THREE.MathUtils.degToRad(leg.ankle || 0);
  }
}

export default function VisualizationPane({
  latest,
  layoutPoints,
  sensors,
  running,
  demoActive,
  onToggleDemo,
  onInjectPose,
}) {
  console.log("[3D Visualization] component render start", {
    latestProvided: !!latest,
    layoutPointsCount: layoutPoints?.length,
    sensorsKeys: Object.keys(sensors || {}),
    running,
    demoActive,
  });
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const partsRef = useRef({ fingers: [] });
  const cubeRef = useRef(null);
  const [model, setModel] = useState("wrist");
  const [manualPose, setManualPose] = useState(defaultPose);
  const [rendererInitFailed, setRendererInitFailed] = useState(false);

  console.log("Canvas ref =", containerRef.current);

  const phaseRef = useRef({
    mounted: false,
    canvasReady: false,
    rendererReady: false,
    modelsReady: false,
    animationLoop: false,
    sensorStream: false,
  });

  useEffect(() => {
    console.log("[3D Visualization] mount effect start");
    console.log("[3D Visualization] Component mounted");
    phaseRef.current.mounted = true;
    console.log("Canvas ref:", containerRef.current);
  }, []);

  const livePose = useMemo(() => latest?.pose || defaultPose, [latest?.pose]);
  const lerpedPose = useLerpedPose(livePose);
  const poseRef = useRef(lerpedPose);

  useEffect(() => {
    console.log("[3D Visualization] poseRef sync effect start");
    poseRef.current = lerpedPose;
  }, [lerpedPose]);

  useEffect(() => {
    console.log("[3D Visualization] manual pose sync effect start", livePose);
    setManualPose(livePose);
  }, [livePose]);

  useEffect(() => {
    console.log("[3D Visualization] init effect start");
    try {
      console.log("[3D Visualization] initializing scene...");
      console.log("[3D Visualization] THREE import keys", Object.keys(THREE || {}));
      const width = containerRef.current?.clientWidth || 600;
      const height = 420;

      if (!containerRef.current) {
        console.error("[3D Visualization] container ref missing");
      }
      if (width === 0 || height === 0) {
        console.warn("[3D Visualization] canvas size is 0×0", { width, height });
      } else {
        console.log("[3D Visualization] canvas size", { width, height });
      }

      console.log("[3D Visualization] creating scene...");
      const scene = new THREE.Scene();
      console.log("[3D Visualization] scene created", scene);
      scene.background = new THREE.Color("#f8fafc");
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(1.2, 1.3, 4.8);
      camera.lookAt(0, 0.4, 0);

      console.log("[3D Visualization] initializing renderer...");
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (err) {
        console.error("3D INIT ERROR: renderer constructor failed", err);
        setRendererInitFailed(true);
        throw err;
      }
      if (!renderer || !renderer.domElement) {
        console.error("[3D Visualization] renderer failed to initialize", renderer);
      }
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      containerRef.current?.appendChild(renderer.domElement);
      console.log("[3D Visualization] renderer initialized", renderer);
      console.log("[3D Visualization] renderer DOM element", renderer?.domElement);
      phaseRef.current.canvasReady = true;
      phaseRef.current.rendererReady = true;

      const ambient = new THREE.AmbientLight(0xffffff, 1.1);
      const key = new THREE.DirectionalLight(0xffffff, 0.8);
      key.position.set(2, 3, 3);
      scene.add(ambient, key);

      const grid = new THREE.GridHelper(12, 12, 0xcbd5e1, 0xe2e8f0);
      grid.position.y = -0.7;
      scene.add(grid);

      console.log("[3D Visualization] building models...");
      const wrist = buildWrist(scene, partsRef);
      const leg = buildLeg(scene, partsRef);
      leg.visible = false;
      scene.add(wrist);
      scene.add(leg);
      console.log("[3D Visualization] models added", { wrist, leg });
      phaseRef.current.modelsReady = true;

      const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xeb5f5f })
      );
      debugCube.position.set(-1, 0.8, 0);
      scene.add(debugCube);
      cubeRef.current = debugCube;
      console.log("[3D Visualization] debug cube added", debugCube);

      sceneRef.current = scene;
      rendererRef.current = renderer;
      cameraRef.current = camera;

      let frameCount = 0;
      const animate = () => {
        try {
          frameCount += 1;
          console.log("[3D Visualization] frame start", frameCount);
          if (cubeRef.current) {
            cubeRef.current.rotation.x += 0.01;
            cubeRef.current.rotation.y += 0.015;
          }
          applyPoseToScene(poseRef.current, partsRef);
          if (frameCount % 60 === 0) {
            console.log("[3D Visualization] applying transforms", poseRef.current);
          }
          console.log("[3D Visualization] frame render call", { frameCount });
          renderer.render(scene, camera);
        } catch (err) {
          console.error("3D FRAME ERROR:", err);
        }
      };
      renderer.setAnimationLoop(animate);
      phaseRef.current.animationLoop = true;
      console.log("[3D Visualization] animation loop started");

      const onResize = () => {
        try {
          const w = containerRef.current?.clientWidth || width;
          const h = height;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          console.log("[3D Visualization] resize", { w, h });
        } catch (err) {
          console.error("[3D Visualization] resize error", err);
        }
      };
      window.addEventListener("resize", onResize);

      console.log("[3D Visualization] Phase summary", phaseRef.current);

      return () => {
        console.log("[3D Visualization] cleanup start");
        renderer.setAnimationLoop(null);
        renderer.dispose();
        containerRef.current?.removeChild(renderer.domElement);
        window.removeEventListener("resize", onResize);
      };
    } catch (err) {
      console.error("3D INIT ERROR:", err);
      setRendererInitFailed(true);
      console.log("[3D Visualization] Phase summary", phaseRef.current);
    }
  }, []);

  useEffect(() => {
    console.log("[3D Visualization] model toggle effect start", { model });
    if (!sceneRef.current) return;
    const [wrist, leg] = sceneRef.current.children.filter((c) => c.type === "Group");
    if (wrist && leg) {
      wrist.visible = model === "wrist";
      leg.visible = model === "leg";
    }
    console.log("[3D Visualization] model visibility set", { model });
  }, [model]);

  const updateManual = (next) => {
    setManualPose(next);
    onInjectPose(next);
  };

  const slider = (label, value, onChange, min, max, step = 1, suffix = "°") => (
    <div className="grid gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs">{value.toFixed(0)}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );

  const latestSensors = useMemo(() => {
    console.log("[3D Visualization] latestSensors memo compute");
    if (!latest)
      return { strain: ["—", "—", "—"], fsr: ["—", "—", "—"], resp: "—" };
    return {
      strain: latest.strain?.map((v) => v.toFixed(2)) ?? [],
      fsr: latest.fsr?.map((v) => v.toFixed(1)) ?? [],
      resp: latest.resp?.toFixed(2) ?? "—",
    };
  }, [latest]);

  useEffect(() => {
    console.log("[3D Visualization] sensor stream effect start");
    if (!latest) return;
    phaseRef.current.sensorStream = true;
    console.log("[3D Visualization] sensor data received", latest);
    console.log("[3D Visualization] Phase summary", phaseRef.current);
  }, [latest]);

  useEffect(() => {
    console.log("[3D Visualization] unmount effect start");
    return () => {
      console.log("[3D Visualization] unmount summary", phaseRef.current);
    };
  }, []);

  useEffect(() => {
    console.log("[3D Visualization] props change effect", {
      latestProvided: !!latest,
      layoutPointsCount: layoutPoints?.length,
      sensorsKeys: Object.keys(sensors || {}),
      running,
      demoActive,
    });
  }, [latest, layoutPoints, sensors, running, demoActive]);

  useEffect(() => {
    console.log("[3D Visualization] fallback cube effect start", {
      rendererInitFailed,
      hasRenderer: !!rendererRef.current,
    });
    if (!rendererInitFailed || !containerRef.current) return;
    try {
      console.log("[3D Visualization] initializing fallback scene...");
      const width = containerRef.current?.clientWidth || 400;
      const height = 320;
      const fallbackScene = new THREE.Scene();
      fallbackScene.background = new THREE.Color("#eef2ff");
      const fallbackCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
      fallbackCamera.position.set(1.5, 1.5, 3.5);
      fallbackCamera.lookAt(0, 0, 0);

      let fallbackRenderer = rendererRef.current;
      if (!fallbackRenderer) {
        fallbackRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        containerRef.current.appendChild(fallbackRenderer.domElement);
      }
      fallbackRenderer.setSize(width, height);
      fallbackRenderer.setPixelRatio(window.devicePixelRatio);

      const ambient = new THREE.AmbientLight(0xffffff, 1.2);
      fallbackScene.add(ambient);

      const fallbackCube = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x2563eb })
      );
      fallbackScene.add(fallbackCube);
      console.log("[3D Visualization] fallback cube created", fallbackCube);

      let frame = 0;
      const tick = () => {
        try {
          frame += 1;
          fallbackCube.rotation.x += 0.02;
          fallbackCube.rotation.y += 0.025;
          console.log("[3D Visualization] fallback frame", frame);
          fallbackRenderer.render(fallbackScene, fallbackCamera);
        } catch (err) {
          console.error("3D FRAME ERROR:", err);
        }
      };
      fallbackRenderer.setAnimationLoop(tick);
    } catch (err) {
      console.error("3D INIT ERROR:", err);
    }
  }, [rendererInitFailed]);

  const layoutSvg = (
    <svg viewBox="0 0 360 180" className="w-full h-[160px]">
      <rect x="0" y="0" width="360" height="180" rx="12" fill="#f1f5f9" />
      {layoutPoints.map((p) => (
        <g key={p.id}>
          <circle cx={p.x * 0.6} cy={p.y * 0.7} r={6} fill="#0ea5e9" />
          <text x={p.x * 0.6 + 10} y={p.y * 0.7 + 4} fontSize={11} fill="#0f172a">
            {p.id}
          </text>
        </g>
      ))}
    </svg>
  );

  try {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">3D Visualization</h2>
            <p className="text-sm text-slate-600">
              Live articulated wrist/leg driven by the shared simulated signals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Mode</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border rounded-lg px-2 py-1"
            >
              <option value="wrist">Wrist visualization</option>
              <option value="leg">Leg visualization</option>
            </select>
            <button
              onClick={onToggleDemo}
              className={`px-3 py-1.5 rounded-xl text-white ${
                demoActive ? "bg-emerald-600" : "bg-slate-900"
              }`}
            >
              {demoActive ? "Stop Randomized Demo" : "Run Randomized Demonstration"}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl p-2 bg-slate-50">
            <div ref={containerRef} className="w-full" />
          </div>
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Manual articulation</h3>
                <span className="text-xs text-slate-500">
                  Injects values into the shared stream
                </span>
              </div>
              {model === "wrist" && (
                <div className="space-y-3">
                  {slider(
                    "Flexion/Extension",
                    manualPose.wrist.flexion,
                    (v) =>
                      updateManual({
                        ...manualPose,
                        wrist: { ...manualPose.wrist, flexion: v },
                      }),
                    -70,
                    90
                  )}
                  {slider(
                    "Pronation/Supination",
                    manualPose.wrist.rotation,
                    (v) =>
                      updateManual({
                        ...manualPose,
                        wrist: { ...manualPose.wrist, rotation: v },
                      }),
                    -80,
                    80
                  )}
                  {slider(
                    "Finger curl",
                    manualPose.wrist.fingers[0],
                    (v) =>
                      updateManual({
                        ...manualPose,
                        wrist: { ...manualPose.wrist, fingers: [v, v - 5, v - 10] },
                        leg: manualPose.leg,
                      }),
                    0,
                    95
                  )}
                </div>
              )}
              {model === "leg" && (
                <div className="space-y-3">
                  {slider(
                    "Knee flexion",
                    manualPose.leg.knee,
                    (v) => updateManual({ ...manualPose, leg: { ...manualPose.leg, knee: v } }),
                    -10,
                    120
                  )}
                  {slider(
                    "Ankle flexion",
                    manualPose.leg.ankle,
                    (v) => updateManual({ ...manualPose, leg: { ...manualPose.leg, ankle: v } }),
                    -40,
                    60
                  )}
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
              <div className="font-semibold text-sm">Live telemetry</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Telemetry label="Strain" value={latestSensors.strain.join(", ")} />
                <Telemetry label="FSR" value={latestSensors.fsr.join(", ")} />
                <Telemetry label="Resp" value={latestSensors.resp} />
                <Telemetry label="Sensors" value={Object.keys(sensors).filter((k) => sensors[k]).join(", ") || "none"} />
                <Telemetry label="Stream state" value={running ? "Running" : "Paused"} />
                <Telemetry label="Pose source" value={demoActive ? "Random demo" : "Live/Manual"} />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="font-semibold text-sm mb-1">Sensor anchors (from layout)</div>
              <div className="text-xs text-slate-600 mb-2">
                Markers mirror the editable layout tab so placement matches the rendered model.
              </div>
              {layoutSvg}
            </div>
          </div>
        </div>
      </section>
    );
  } catch (err) {
    console.error("[3D Visualization] render error", err);
    return <div className="text-red-600">3D Visualization failed to render.</div>;
  }
}

function Telemetry({ label, value }) {
  return (
    <div className="p-2 rounded-lg bg-slate-50 border">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-xs text-slate-800 break-words">{value}</div>
    </div>
  );
}
