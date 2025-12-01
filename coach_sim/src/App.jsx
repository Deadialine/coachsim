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
        const grip = clamp(
          rnd(params.gripTarget, 6) *
            (sensors.forcePads ? 1 : 0) *
            (mode === "REST" ? 0.6 : 1),
          0,
          user.gripMax
        );
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
        const rec = { t, smooth, tremor, grip, hr, rr };
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
    { id: "bicep", x: 160, y: 80 },
    { id: "forearm", x: 270, y: 160 },
    { id: "wrist", x: 330, y: 210 },
    { id: "ppg", x: 140, y: 130 },
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
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Sensor Layout (drag points)</h2>
        <div className="text-xs text-slate-500">
          Move markers to plan traces & pad placement
        </div>
      </div>
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
      </div>
      <p className="text-sm text-slate-600 mt-3">
        Use this as a quick storyboard for trace routing and patch placement
        before sewing the pocket for the MCU/battery.
      </p>
    </section>
  );
}

function TPUTrace({ points }) {
  const order = ["bicep", "forearm", "wrist"]; // simple polyline
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
      {/* Force pads near wrist */}
      <circle
        cx={points.find((p) => p.id === "wrist")?.x || 330}
        cy={points.find((p) => p.id === "wrist")?.y || 210}
        r={14}
        fill="#22c55e"
        opacity={0.8}
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
function LogPane({ notes, onExport }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Coaching Events Log</h2>
        <button
          onClick={onExport}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:opacity-40"
          disabled={!notes.length}
        >
          Export CSV
        </button>
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
