import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

/**
 * Interactive Bi‑Directional Coaching System — Concept Simulator
 * -------------------------------------------------------------
 * What this demo gives you:
 * 1) A layered, interactive concept of the wearable sleeve + coach loop.
 * 2) Editable sensor layout (toggle sensors, drag waypoints on a simple SVG arm).
 * 3) Real‑time simulated signals (IMU smoothness, tremor power, grip force, HR / RR).
 * 4) Coaching logic sandbox (rule thresholds + adaptive state machine).
 * 5) Data log & export (CSV) for your proposal figures or a quick demo.
 *
 * No external APIs. Pure client‑side, Tailwind‑ready. Drop into Next.js/Vite.
 */

// ---------- Utilities ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rnd = (m = 1, v = 0.2) => m + (Math.random() - 0.5) * 2 * v; // mean +/‑ variance

// Simple CSV exporter
function exportCSV(rows, filename = "coaching_log.csv") {
  const header = Object.keys(rows[0] || {}).join(",");
  const lines = rows.map((r) => Object.values(r).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Fake user model ----------
const defaultUserModel = {
  name: "Demo User",
  hrRest: 72,
  rrRest: 12, // breaths per minute
  tremorBase: 0.15,
  gripMax: 60, // Newtons
  smoothnessBase: 0.7,
};

// ---------- Tabs ----------
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "layout", label: "Sensor Layout" },
  { id: "signals", label: "Signals" },
  { id: "logic", label: "Coaching Logic" },
  { id: "log", label: "Data Log" },
];

// ---------- Main Component ----------
export default function App() {
  const [active, setActive] = useState("overview");
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [user] = useState(defaultUserModel);

  // Enabled sensors
  const [sensors, setSensors] = useState({
    tpuForearm: true,
    tpuBicep: true,
    tpuShoulder: true,
    forcePads: true,
    imu: true,
    ppg: true,
    resp: true,
    haptic: true,
  });

  // Thresholds / policy params
  const [params, setParams] = useState({
    tremorWarn: 0.35,
    tremorRest: 0.55,
    smoothMin: 0.45,
    gripTarget: 18,
    hrCeiling: 120,
    rrCeiling: 20,
    difficulty: 1.0,
  });

  // Simulated streams
  const [stream, setStream] = useState([]); // {t, smooth, tremor, grip, hr, rr}
  const [message, setMessage] = useState("Coach idle. Press Start.");
  const [mode, setMode] = useState("IDLE"); // IDLE | COACHING | REST
  const [notes, setNotes] = useState([]); // log lines

  const tickRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setTime((t) => t + 1);
      setStream((arr) => {
        const t = arr.length ? arr[arr.length - 1].t + 1 : 0;
        // synth signals with mild drifts
        const smooth = clamp(
          rnd(user.smoothnessBase, 0.15) * params.difficulty,
          0,
          1
        );
        const tremor = clamp(rnd(user.tremorBase, 0.2) * (1.15 - smooth), 0, 1);
        const strain = [
          clamp(rnd(0.46, 0.08), 0, 1), // wrist bridge
          clamp(rnd(0.52, 0.08), 0, 1), // elbow bridge
          clamp(rnd(0.58, 0.08), 0, 1), // shoulder bridge
        ];
        const emgEnv = clamp(rnd(0.35, 0.12) * (smooth < 0.55 ? 1.2 : 0.9), 0, 1);
        const grip = clamp(
          rnd(params.gripTarget, 6) *
            (sensors.forcePads ? 1 : 0) *
            (mode === "REST" ? 0.6 : 1),
          0,
          user.gripMax
        );
        const fsr = [
          clamp(grip * 0.45 + rnd(4, 2), 0, user.gripMax / 2),
          clamp(grip * 0.35 + rnd(3, 2), 0, user.gripMax / 2),
          clamp(rnd(16, 6), 0, 45),
        ];
        const hr = clamp(
          rnd(
            user.hrRest + params.difficulty * 25 * (smooth < 0.55 ? 1 : 0.6),
            4
          ),
          50,
          200
        );
        const rr = clamp(
          rnd(user.rrRest + (hr - user.hrRest) / 20, 1.4),
          6,
          35
        );
        const resp = clamp(rnd(0.55, 0.1) * (rr / 18), 0, 1.2);
        const rec = { t, smooth, tremor, strain, emgEnv, fsr, resp, grip, hr, rr };
        return [...arr.slice(-180), rec]; // keep ~3 minutes @ 1 Hz
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, params.difficulty, sensors.forcePads, mode, user]);

  // Coaching policy — simple rule engine with mode transitions
  useEffect(() => {
    const last = stream[stream.length - 1];
    if (!last) return;

    let nextMode = mode;
    let coach = "";

    // Health safety gates
    if (
      (sensors.ppg && last.hr > params.hrCeiling) ||
      (sensors.resp && last.rr > params.rrCeiling)
    ) {
      nextMode = "REST";
      coach = "Heart/resp high — pause and breathe";
    }
    // Tremor gating
    else if (sensors.tpuForearm && last.tremor > params.tremorRest) {
      nextMode = "REST";
      coach = "Tremor elevated — guided rest";
    }
    // Coaching
    else if (running) {
      nextMode = "COACHING";
      if (last.smooth < params.smoothMin) coach = "Slow down, lengthen exhale";
      else if (Math.abs(last.grip - params.gripTarget) > 8)
        coach = "Match both hands gently";
      else if (last.tremor > params.tremorWarn)
        coach = "Micro‑break: shake out wrist";
      else coach = "Nice form — adding tiny challenge";
    } else {
      nextMode = "IDLE";
      coach = "Coach idle. Press Start.";
    }

    // Haptic suggestion text (if enabled)
    if (sensors.haptic && nextMode !== "IDLE") {
      coach += " • Haptic cue: 200 ms pulse";
    }

    setMode(nextMode);
    setMessage(coach);

    // Log when advice changes materially or every ~15s
    if (
      stream.length % 15 === 0 ||
      coach.includes("pause") ||
      coach.includes("Nice")
    ) {
      setNotes((n) => [
        ...n,
        {
          ts: new Date().toISOString(),
          mode: nextMode,
          msg: coach,
          smooth: last.smooth.toFixed(2),
          tremor: last.tremor.toFixed(2),
          grip: last.grip.toFixed(1),
          hr: Math.round(last.hr),
          rr: Math.round(last.rr),
        },
      ]);
    }
  }, [stream, running, sensors, params, mode]);

  const start = () => {
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setMode("IDLE");
    setMessage("Coach idle. Press Start.");
  };
  const reset = () => {
    setStream([]);
    setNotes([]);
    setTime(0);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-xl font-bold">
            Bi‑Directional Coaching — Interactive Concept
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={start}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40"
              disabled={running}
            >
              Start
            </button>
            <button
              onClick={stop}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white disabled:opacity-40"
              disabled={!running}
            >
              Pause
            </button>
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-xl bg-slate-200"
            >
              Reset
            </button>
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: Tabs & Controls */}
        <div className="lg:col-span-1 space-y-6">
          <nav className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
            <ul className="grid gap-1">
              {tabs.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActive(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl ${
                      active === t.id
                        ? "bg-slate-900 text-white"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
            <h3 className="font-semibold">Sensors</h3>
            {Object.entries(sensors).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between py-1">
                <span className="capitalize">
                  {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                </span>
                <input
                  type="checkbox"
                  checked={v}
                  onChange={(e) =>
                    setSensors({ ...sensors, [k]: e.target.checked })
                  }
                />
              </label>
            ))}
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
            <h3 className="font-semibold">Policy Parameters</h3>
            {[
              ["tremorWarn", 0, 1, 0.01],
              ["tremorRest", 0, 1, 0.01],
              ["smoothMin", 0, 1, 0.01],
              ["gripTarget", 0, 60, 1],
              ["hrCeiling", 80, 180, 1],
              ["rrCeiling", 10, 35, 1],
              ["difficulty", 0.6, 1.8, 0.01],
            ].map(([key, min, max, step]) => (
              <div key={key.toString()} className="grid gap-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{key.toString()}</span>
                  <span className="font-mono">
                    {params[key].toFixed(step < 1 ? 2 : 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={params[key]}
                  onChange={(e) =>
                    setParams({ ...params, [key]: Number(e.target.value) })
                  }
                />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold mb-2">Coach</h3>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Mode
            </div>
            <div className="mb-2 font-semibold">{mode}</div>
            <div className="rounded-xl bg-slate-900 text-white p-3 text-sm min-h-[64px]">
              {message}
            </div>
          </section>
        </div>

        {/* Right column: Content panes */}
        <div className="lg:col-span-3 space-y-6">
          {active === "overview" && <OverviewPane />}
          {active === "layout" && <LayoutPane />}
          {active === "signals" && (
            <SignalsPane stream={stream} params={params} />
          )}
          {active === "logic" && (
            <LogicPane
              stream={stream}
              params={params}
              sensors={sensors}
              mode={mode}
            />
          )}
          {active === "log" && (
            <LogPane
              notes={notes}
              latest={stream[stream.length - 1]}
              onExport={() => notes.length && exportCSV(notes)}
            />
          )}
        </div>
      </div>

      <footer className="max-w-7xl mx-auto px-4 pb-8 text-xs text-slate-500">
        Simulated data; for concept only. Tailor thresholds and signals to your
        printed‑TPU characterization when available.
      </footer>
    </div>
  );
}

// ---------- Overview ----------
function Chip({ children }) {
  return (
    <span className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs">
      {children}
    </span>
  );
}

function OverviewPane() {
  const items = [
    {
      title: "Hardware",
      tags: [
        "Printed TPU",
        "IMU",
        "Force pads",
        "PPG",
        "Resp",
        "Haptics",
        "ESP32",
      ],
    },
    {
      title: "Signals",
      tags: ["Smoothness", "Tremor power", "Grip N", "HR", "RR", "HRV"],
    },
    {
      title: "Logic",
      tags: ["Rules", "Adaptive diff.", "State machine", "Personalization"],
    },
    {
      title: "Interface",
      tags: ["Voice", "Haptic", "Dashboard", "Avatar/Robot"],
    },
  ];
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold mb-2">System Layers</h2>
      <p className="text-slate-600 mb-4">
        Explore each tab to tune sensors, view signals, and test the coaching
        loop. Use this as a live figure in your proposal or to brief
        collaborators.
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {items.map((it) => (
          <div
            key={it.title}
            className="border border-slate-200 rounded-2xl p-4"
          >
            <div className="font-semibold mb-2">{it.title}</div>
            <div className="flex flex-wrap gap-2">
              {it.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Sensor Layout (SVG) ----------
function LayoutPane() {
  const [points, setPoints] = useState([
    { id: "shoulder", x: 110, y: 70 },
    { id: "bicep", x: 170, y: 90 },
    { id: "forearm", x: 260, y: 150 },
    { id: "wrist", x: 330, y: 200 },
    { id: "imu", x: 210, y: 120 },
    { id: "ppg", x: 140, y: 130 },
    { id: "resp", x: 80, y: 110 },
  ]);
  const dragging = useRef(null);

  const onDown = (id) => (e) => {
    dragging.current = { id, ox: e.clientX, oy: e.clientY };
  };
  const onMove = (e) => {
    if (!dragging.current) return;
    const { id, ox, oy } = dragging.current;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    setPoints((ps) =>
      ps.map((p) => (p.id === id ? { ...p, x: p.x + dx, y: p.y + dy } : p))
    );
    dragging.current = { id, ox: e.clientX, oy: e.clientY };
  };
  const onUp = () => (dragging.current = null);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Sensor Layout & Bus Plan</h2>
        <div className="text-xs text-slate-500">
          Drag markers, channels map to the shared SPI backbone
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          <svg viewBox="0 0 560 260" className="w-full h-[260px]">
            {/* Arm silhouette */}
            <defs>
              <linearGradient id="arm" x1="0" x2="1">
                <stop offset="0%" stopColor="#e5e7eb" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>
            <path
              d="M60,80 C120,40 180,40 220,60 C260,80 290,120 330,140 C360,150 410,160 500,180 C520,190 520,210 500,215 C420,230 340,220 300,210 C240,195 220,170 190,150 C160,130 110,120 60,140 C40,130 40,90 60,80 Z"
              fill="url(#arm)"
              stroke="#94a3b8"
            />
            {/* TPU conductive traces between points */}
            <TPUTrace points={points} />
            {/* Draggable markers */}
            {points.map((p) => (
              <g key={p.id} onMouseDown={onDown(p.id)} className="cursor-grab">
                <circle cx={p.x} cy={p.y} r={10} fill="#0ea5e9" opacity={0.9} />
                <text x={p.x + 12} y={p.y + 4} fontSize={12} fill="#0f172a">
                  {p.id}
                </text>
              </g>
            ))}
          </svg>
          <div className="px-4 py-3 text-xs text-slate-600 border-t bg-white flex flex-wrap gap-3">
            <span className="px-2 py-1 rounded-full bg-slate-100 border">Blue: TPU strain traces</span>
            <span className="px-2 py-1 rounded-full bg-slate-100 border">Green: FSR pads (MCP3208)</span>
            <span className="px-2 py-1 rounded-full bg-slate-100 border">Gold: PPG / Resp band</span>
            <span className="px-2 py-1 rounded-full bg-slate-100 border">Purple: IMU on SPI</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-1">Shared SPI backbone</h3>
            <p className="text-sm text-slate-600 mb-2">
              ESP32-S3 is master; SCK/MOSI/MISO are common. Only one chip-select is
              asserted at a time so MISO stays clean.
            </p>
            <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
              <li>CS_IMU → ICM-42688-P (200 Hz accel/gyro)</li>
              <li>CS_MCP3564 → 24-bit ADC for bridges & EMG envelope</li>
              <li>CS_MCP3208 → 12-bit ADC for FSR + respiration divider</li>
            </ul>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-1">Analog front-end map</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3 border">
                <div className="font-semibold text-slate-800 mb-1">MCP3564R (24-bit)</div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>CH0: Wrist strain (INA333)</li>
                  <li>CH1: Elbow strain (INA333)</li>
                  <li>CH2: Shoulder strain (INA333)</li>
                  <li>CH4: EMG envelope (MyoWare SIG)</li>
                  <li>CH3, CH5-CH7: Spares</li>
                </ul>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border">
                <div className="font-semibold text-slate-800 mb-1">MCP3208 (12-bit)</div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>CH0: Grip FSR 1 (thumb)</li>
                  <li>CH1: Grip FSR 2 (palm)</li>
                  <li>CH2: Stance FSR</li>
                  <li>CH3: Respiration band</li>
                  <li>CH4-CH7: Spare I/O</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-1">Power, timing, framing</h3>
            <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
              <li>Single 3.3 V rail + common ground across IMU/ADCs/amps/FSRs.</li>
              <li>1 kHz MCU timer drives synchronized reads; IMU + ADCs sampled at 200 Hz.</li>
              <li>Samples packed into a unified frame and streamed via BLE or USB.</li>
            </ul>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-600 mt-3">
        Use this storyboard to keep the digital bus, analog front-end, and pad placement
        coherent with the printed sleeve and the ESP32-S3 feather pocket.
      </p>
    </section>
  );
}

function TPUTrace({ points }) {
  const order = ["shoulder", "bicep", "forearm", "wrist"]; // simple polyline
  const coords = order
    .map((id) => points.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  return (
    <g>
      <polyline
        points={coords}
        stroke="#0284c7"
        strokeWidth={5}
        fill="none"
        opacity={0.8}
      />
      {/* IMU puck anchored near elbow for shared SPI */}
      <rect
        x={(points.find((p) => p.id === "imu")?.x || 210) - 12}
        y={(points.find((p) => p.id === "imu")?.y || 120) - 12}
        width={24}
        height={24}
        rx={6}
        fill="#a855f7"
        opacity={0.9}
      />
      {/* Force pads near wrist */}
      <circle
        cx={points.find((p) => p.id === "wrist")?.x || 330}
        cy={points.find((p) => p.id === "wrist")?.y || 210}
        r={14}
        fill="#22c55e"
        opacity={0.8}
      />
      {/* Stance pad toward forearm underside */}
      <circle
        cx={(points.find((p) => p.id === "forearm")?.x || 260) - 30}
        cy={(points.find((p) => p.id === "forearm")?.y || 150) + 30}
        r={12}
        fill="#16a34a"
        opacity={0.75}
      />
      {/* PPG patch */}
      <rect
        x={(points.find((p) => p.id === "ppg")?.x || 140) - 12}
        y={(points.find((p) => p.id === "ppg")?.y || 130) - 8}
        width={24}
        height={16}
        rx={4}
        fill="#f59e0b"
        opacity={0.9}
      />
    </g>
  );
}

// ---------- Signals ----------
function SignalsPane({ stream, params }) {
  const data = useMemo(() => stream.map((d) => ({ ...d, t: d.t })), [stream]);
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-6">
      <h2 className="text-lg font-semibold">Real‑time Signals (simulated)</h2>

      <ChartCard title="Movement Smoothness & Tremor">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={data}
            margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.7} />
                <stop offset="90%" stopColor="#0ea5e9" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                <stop offset="90%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="smooth"
              name="Smoothness"
              stroke="#0ea5e9"
              fill="url(#g1)"
            />
            <Area
              type="monotone"
              dataKey="tremor"
              name="Tremor"
              stroke="#ef4444"
              fill="url(#g2)"
            />
            {/* Thresholds */}
            <ReferenceLine
              y={params.smoothMin}
              label="min smooth"
              stroke="#0ea5e9"
              strokeDasharray="4 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Grip Force (N)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={data}
            margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 60]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="grip"
              name="Grip"
              stroke="#22c55e"
              dot={false}
            />
            <ReferenceLine
              y={params.gripTarget}
              label="target"
              stroke="#22c55e"
              strokeDasharray="4 4"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Heart Rate / Respiration">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={data}
            margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" domain={[50, 180]} tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[6, 35]}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="hr"
              name="HR"
              stroke="#8b5cf6"
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rr"
              name="RR"
              stroke="#f59e0b"
              dot={false}
            />
            <ReferenceLine
              y={params.hrCeiling}
              yAxisId="left"
              label="HR ceiling"
              stroke="#8b5cf6"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={params.rrCeiling}
              yAxisId="right"
              label="RR ceiling"
              stroke="#f59e0b"
              strokeDasharray="4 4"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-2xl p-4">
      <div className="font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

// Lightweight ReferenceLine to avoid bringing in full Recharts component types
function ReferenceLine({
  y,
  label,
  stroke = "#64748b",
  yAxisId,
  strokeDasharray = "4 4",
}) {
  return (
    // Recharts doesn't expose simple overlay here, so rely on Tooltip/Legend for semantics.
    // This is a no-op placeholder to keep the API readable in this inline file.
    <></>
  );
}

// ---------- Coaching Logic ----------
function LogicPane({ stream, params, sensors, mode }) {
  const last = stream[stream.length - 1];

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
      <h2 className="text-lg font-semibold">Rule Graph (live)</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded-2xl p-4">
          <div className="text-sm text-slate-600 mb-2">Inputs</div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li className="p-2 bg-slate-50 rounded-lg">
              smooth: <b>{last?.smooth?.toFixed(2) ?? "—"}</b>
            </li>
            <li className="p-2 bg-slate-50 rounded-lg">
              tremor: <b>{last?.tremor?.toFixed(2) ?? "—"}</b>
            </li>
            <li className="p-2 bg-slate-50 rounded-lg">
              grip: <b>{last?.grip?.toFixed(1) ?? "—"}</b> N
            </li>
            <li className="p-2 bg-slate-50 rounded-lg">
              HR: <b>{last ? Math.round(last.hr) : "—"}</b>
            </li>
            <li className="p-2 bg-slate-50 rounded-lg">
              RR: <b>{last ? Math.round(last.rr) : "—"}</b>
            </li>
          </ul>
        </div>
        <div className="border border-slate-200 rounded-2xl p-4">
          <div className="text-sm text-slate-600 mb-2">Gates & Thresholds</div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li className="p-2 rounded-lg border">
              HR &gt; {params.hrCeiling}
            </li>
            <li className="p-2 rounded-lg border">
              RR &gt; {params.rrCeiling}
            </li>
            <li className="p-2 rounded-lg border">
              tremor &gt; {params.tremorRest}
            </li>
            <li className="p-2 rounded-lg border">
              smooth &lt; {params.smoothMin}
            </li>
            <li className="p-2 rounded-lg border">|grip−target| &gt; 8</li>
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StateCard title="IDLE" active={mode === "IDLE"}>
          Waiting for user. No feedback.
        </StateCard>
        <StateCard title="COACHING" active={mode === "COACHING"}>
          Voice + haptic cues, subtle difficulty adaptation.
        </StateCard>
        <StateCard title="REST" active={mode === "REST"}>
          Guided breathing, timer, resume when safe.
        </StateCard>
      </div>

      <div className="text-xs text-slate-500">
        This is a minimal state machine for demos. Swap with your RL policy by
        mapping rewards to
        <em>
          smooth↑, tremor↓, HR within band, target grip proximity, adherence
        </em>
        .
      </div>
    </section>
  );
}

function StateCard({ title, active, children }) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        active ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
      }`}
    >
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

// ---------- Data Log ----------
function LogPane({ notes, latest, onExport }) {
  const unifiedFrame = useMemo(() => {
    if (!latest)
      return {
        t_us: "—",
        imu_acc: ["—", "—", "—"],
        imu_gyro: ["—", "—", "—"],
        strain: ["—", "—", "—"],
        emg_env: "—",
        fsr: ["—", "—", "—"],
        resp: "—",
      };
    return {
      t_us: latest.t * 1000000,
      imu_acc: [rnd(0, 0.08).toFixed(2), rnd(0, 0.08).toFixed(2), rnd(1, 0.08).toFixed(2)],
      imu_gyro: [rnd(0, 4).toFixed(1), rnd(0, 4).toFixed(1), rnd(0, 4).toFixed(1)],
      strain: latest.strain.map((v) => v.toFixed(2)),
      emg_env: latest.emgEnv.toFixed(2),
      fsr: latest.fsr.map((v) => v.toFixed(1)),
      resp: latest.resp.toFixed(2),
    };
  }, [latest]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Coaching Events & Unified Frame</h2>
        <button
          onClick={onExport}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:opacity-40"
          disabled={!notes.length}
        >
          Export CSV
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
          <div className="font-semibold text-sm mb-1">ESP32-S3 unified data frame</div>
          <pre className="bg-white border rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">{`
typedef struct {
  uint32_t t_us;
  float    imu_acc[3];
  float    imu_gyro[3];
  float    strain[3];
  float    emg_env;
  float    fsr[3];
  float    resp;
} sample_t;`}</pre>
          <ul className="text-xs text-slate-700 list-disc list-inside mt-2 space-y-1">
            <li>1 kHz timer aligns IMU (CS_IMU) + MCP3564R + MCP3208 reads at 200 Hz.</li>
            <li>Frames buffered then streamed in BLE packets or USB/serial bursts.</li>
            <li>Great for CSV export or binary logging during sleeve bring-up.</li>
          </ul>
        </div>
        <div className="border border-slate-200 rounded-xl p-3 bg-white">
          <div className="font-semibold text-sm mb-2">Latest simulated frame</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <LabelValue label="t_us" value={unifiedFrame.t_us} />
            <LabelValue label="imu_acc" value={unifiedFrame.imu_acc.join(", ")} />
            <LabelValue label="imu_gyro" value={unifiedFrame.imu_gyro.join(", ")} />
            <LabelValue label="strain" value={unifiedFrame.strain.join(", ")} />
            <LabelValue label="emg_env" value={unifiedFrame.emg_env} />
            <LabelValue label="fsr" value={unifiedFrame.fsr.join(", ")} />
            <LabelValue label="resp" value={unifiedFrame.resp} />
            <LabelValue label="notes" value={notes.length ? `${notes.length} events` : "no events yet"} />
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Flow: ICM-42688-P → SPI → ESP32, strain/EMG bridges → MCP3564R → SPI, FSR/resp → MCP3208 → SPI → frame → BLE/USB.
          </div>
        </div>
      </div>
      <div className="overflow-auto border rounded-xl max-h-[380px]">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              {"ts,mode,msg,smooth,tremor,grip,hr,rr".split(",").map((h) => (
                <th key={h} className="text-left px-3 py-2 border-b">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {notes.map((n, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50">
                <td className="px-3 py-2 border-b font-mono text-xs">{n.ts}</td>
                <td className="px-3 py-2 border-b">{n.mode}</td>
                <td className="px-3 py-2 border-b">{n.msg}</td>
                <td className="px-3 py-2 border-b font-mono">{n.smooth}</td>
                <td className="px-3 py-2 border-b font-mono">{n.tremor}</td>
                <td className="px-3 py-2 border-b font-mono">{n.grip}</td>
                <td className="px-3 py-2 border-b font-mono">{n.hr}</td>
                <td className="px-3 py-2 border-b font-mono">{n.rr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!notes.length && (
        <div className="text-sm text-slate-500 p-3">
          No events yet. Start the simulator to generate logs.
        </div>
      )}
    </section>
  );
}

function LabelValue({ label, value }) {
  return (
    <div className="p-2 bg-slate-50 rounded-lg border">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-800 break-words">{value}</div>
    </div>
  );
}
