import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  CLASSES,
  CONFIG,
  newSession,
  schedule,
  atTime,
  appendSimulation,
  displayPrediction,
  signalQualityAt,
  bundleFiles,
  readBundleFiles,
  migrateV1,
  qualitySummary,
} from "./core.mjs";
import "./experiment.css";
import "./workspace.css";
import "./refinement.css";
import { SensorLayout, CoachingLogic, DataLogs } from "./WorkspacePanels";
import {
  DEFAULT_LAYOUT,
  normalizeLayout,
  coachingDecision,
  addOperatorNote,
} from "./workspace.mjs";
const ExperimentHand = lazy(() => import("../hand/ExperimentHand"));
const HandLab = lazy(() => import("../App"));
const TABS = [
  ["overview", "Overview"],
  ["layout", "Sensor Layout"],
  ["signals", "Signals"],
  ["logic", "Coaching Logic"],
  ["log", "Data Logs"],
  ["hand", "3D Model"],
];
function initialTab() {
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "concept"
    ? "overview"
    : TABS.some(([id]) => id === view)
      ? view
      : "overview";
}
const label = (s) => (s || "uncertain").replaceAll("_", " ");
function Trace({ rows, field, title, color, unit }) {
  const last = rows.at(-1)?.t_us ?? 0,
    span = field.startsWith("emg") ? 200000 : 2000000;
  // Locate the visible range before plotting; full-resolution recordings remain intact.
  let lo = 0,
    hi = rows.length;
  while (lo < hi) {
    let m = (lo + hi) >> 1;
    if (rows[m].t_us < last - span) lo = m + 1;
    else hi = m;
  }
  const shown = rows.slice(lo),
    values = shown.map((r) => r[field]),
    min = values.length ? Math.min(...values) : 0,
    max = values.length ? Math.max(...values) : 1;
  const points = shown
    .map(
      (r) =>
        `${((r.t_us - (last - span)) / span) * 800},${80 - ((r[field] - min) / (max - min || 1)) * 64}`,
    )
    .join(" ");
  return (
    <div className="trace">
      <div>
        <strong>{title}</strong>
        <span>
          {min.toFixed(1)} – {max.toFixed(1)} {unit}
        </span>
      </div>
      <svg viewBox="0 0 800 100" role="img" aria-label={`${title} trace`}>
        <path d="M0 85H800M0 45H800" stroke="#e2e8f0" />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
        />
      </svg>
      <small>
        Window ending at {(last / 1e6).toFixed(2)} s · {span / 1e6} s span
      </small>
    </div>
  );
}
function prefix(rows, t) {
  let lo = 0,
    hi = rows.length;
  while (lo < hi) {
    let m = (lo + hi) >> 1;
    if (rows[m].t_us <= t) lo = m + 1;
    else hi = m;
  }
  return rows.slice(0, lo);
}
export default function Experiment() {
  const [tab, setTab] = useState(initialTab),
    [visitedHand, setVisitedHand] = useState(() => initialTab() === "hand");
  const [layout, setLayout] = useState(() => normalizeLayout(DEFAULT_LAYOUT));
  function navigate(id) {
    setTab(id);
    if (id === "hand") setVisitedHand(true);
    const url = new URL(window.location.href);
    url.searchParams.set("view", id);
    window.history.replaceState(null, "", url);
  }
  const [showHand, setShowHand] = useState(false);
  const data = useRef(newSession()),
    plan = useRef(schedule()),
    clock = useRef(0),
    gate = useRef(null),
    faultRef = useRef(false);
  const [participant, setParticipant] = useState("SIM-001"),
    [session, setSession] = useState("SIM-S01"),
    [seed, setSeed] = useState(20260921);
  const [running, setRunning] = useState(false),
    [replaying, setReplaying] = useState(false),
    [replay, setReplay] = useState(false),
    [cursor, setCursor] = useState(0),
    [revision, render] = useState(0),
    [error, setError] = useState(""),
    [fault, setFault] = useState(false),
    [busy, setBusy] = useState(false);
  const [download, setDownload] = useState(null);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const next = Math.min(
        data.current.session.duration_us + 100000,
        336000000,
      );
      appendSimulation(data.current, next, plan.current, {
        fault: faultRef.current,
      });
      clock.current = next;
      gate.current = displayPrediction(
        signalQualityAt(data.current, next)
          ? data.current.predictions.at(-1)
          : null,
        next,
        gate.current,
      );
      if (next === 336000000) {
        data.current.events.push(plan.current.at(-1));
        setRunning(false);
      }
      render((v) => v + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!replaying) return;
    const timer = setInterval(
      () =>
        setCursor((v) => {
          const n = Math.min(v + 100000, data.current.session.duration_us);
          if (n >= data.current.session.duration_us) setReplaying(false);
          return n;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [replaying]);
  useEffect(() => {
    if (!running) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  function start() {
    setDownload(null);
    if (
      !participant.trim() ||
      !session.trim() ||
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > 4294967295
    ) {
      setError("Enter identifiers and an integer seed from 0 to 4294967295.");
      return;
    }
    data.current = newSession({
      participant: participant.trim(),
      session: session.trim(),
      seed,
    });
    data.current.session.placement_metadata = {
      mode: "simulation",
      coordinate_system: "schematic_region_percent",
      sites: normalizeLayout(layout),
    };
    data.current.session.operator_notes = [];
    plan.current = schedule(seed);
    clock.current = 0;
    gate.current = null;
    faultRef.current = false;
    setFault(false);
    setError("");
    setReplay(false);
    setReplaying(false);
    setRunning(true);
    render((v) => v + 1);
  }
  function stop() {
    setRunning(false);
    data.current.events.push({
      t_us: data.current.session.duration_us,
      event_type: "stop",
      target_posture:
        atTime(plan.current, clock.current)?.target_posture || "neutral_rest",
      repetition: 0,
      block: 0,
    });
    render((v) => v + 1);
  }
  function toggleFault() {
    const next = !faultRef.current;
    faultRef.current = next;
    setFault(next);
    data.current.events.push({
      t_us: data.current.session.duration_us,
      event_type: next ? "fault_on" : "fault_off",
      target_posture:
        atTime(plan.current, clock.current)?.target_posture || "neutral_rest",
      repetition: 0,
      block: 0,
    });
  }
  async function exportZip() {
    try {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 0));
      const files = bundleFiles(data.current);
      const bytes = zipSync(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
        ),
        { level: 1 },
      );
      const u = URL.createObjectURL(
        new Blob([bytes], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = u;
      a.download =
        data.current.session.session_id.replace(/[^a-zA-Z0-9_-]/g, "_") +
        ".zip";
      setDownload({ url: u, name: a.download });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBusy(true);
      setError("");
      if (file.size > 80 * 1024 * 1024)
        throw Error(
          "Archive limit is 80 MB. Use offline tools for larger recordings.",
        );
      let bundle;
      if (file.name.toLowerCase().endsWith(".csv"))
        bundle = migrateV1(await file.text());
      else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let total = 0;
        const z = unzipSync(bytes, {
          filter: (f) => {
            total += f.originalSize;
            if (total > 240 * 1024 * 1024)
              throw Error("Unpacked archive exceeds 240 MB");
            return [
              "session.json",
              "emg.csv",
              "imu.csv",
              "events.csv",
              "predictions.csv",
            ].includes(f.name);
          },
        });
        bundle = readBundleFiles(
          Object.fromEntries(
            Object.entries(z).map(([k, v]) => [k, strFromU8(v)]),
          ),
        );
      }
      data.current = bundle;
      if (bundle.session.placement_metadata?.sites)
        setLayout(normalizeLayout(bundle.session.placement_metadata.sites));
      setDownload(null);
      setReplay(true);
      setReplaying(false);
      setCursor(0);
      gate.current = null;
      render((v) => v + 1);
    } catch (ex) {
      setError(`Import failed: ${ex.message}`);
    } finally {
      setBusy(false);
    }
  }
  const b = data.current,
    t = replay ? cursor : b.session.duration_us,
    pred = atTime(b.predictions, t),
    cue = atTime(
      b.events.filter((e) =>
        ["cue", "rest", "complete"].includes(e.event_type),
      ),
      t,
    );
  const emg = replay ? prefix(b.emg, t) : b.emg,
    imu = replay ? prefix(b.imu, t) : b.imu;
  let status = running
    ? gate.current
    : displayPrediction(signalQualityAt(b, t) ? pred : null, t, null);
  if (!running && pred && status?.label !== "uncertain") {
    let since = pred.t_us;
    for (let i = b.predictions.indexOf(pred) - 1; i >= 0; i--) {
      const prev = b.predictions[i];
      if (
        prev.predicted_posture !== status.label ||
        prev.quality_ok !== 1 ||
        prev.confidence < CONFIG.confidence_min ||
        since - prev.t_us > 250000
      )
        break;
      since = prev.t_us;
    }
    status = { ...status, since, stable: t - since >= CONFIG.stability_us };
  }
  const quality = qualitySummary(
    emg,
    2000,
    replay ? Math.min(t + 500, b.session.duration_us) : b.session.duration_us,
    true,
  );
  const recentBad = emg.length && !signalQualityAt(b, t);
  const decision = coachingDecision({
    prediction: pred,
    status,
    target: cue?.target_posture,
    eventType: cue?.event_type,
    qualityOk: signalQualityAt(b, t),
    t,
  });
  function saveNote(text) {
    addOperatorNote(b.session, { text, t_us: t, target: cue?.target_posture });
    setDownload(null);
    render((v) => v + 1);
  }
  const nextBoundary = (replay ? b.events : plan.current).find(
    (e) =>
      ["cue", "rest", "complete"].includes(e.event_type) &&
      e.t_us > (cue?.t_us ?? -1),
  );
  const remaining =
    cue && ["cue", "rest"].includes(cue.event_type)
      ? Math.max(
          0,
          ((nextBoundary?.t_us ?? cue.t_us + 3000000) - t) / 1e6,
        ).toFixed(1)
      : "—";
  const provenance =
    b.session.provenance === "synthetic"
      ? "SIMULATED DATA"
      : b.session.provenance === "recorded"
        ? "IMPORTED RECORDING"
        : "LEGACY · UNVERIFIED";
  void revision;
  return (
    <div className={`experiment view-${tab}`}>
      <header>
        <div className="brand">
          <span className="brand-icon">C</span>
          <div>
            <strong>CoachSim</strong>
            <small>Forearm sensing experiment</small>
          </div>
        </div>
        <nav>
          <span className="muted">4 × sEMG · 1 × IMU</span>
          <span className="pill">{provenance}</span>
        </nav>
      </header>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="CoachSim workspace"
      >
        {TABS.map(([id, name], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="workspace-panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(e) => {
              const offset =
                e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? TABS.length - 1
                    : (index + offset + TABS.length) % TABS.length;
              if (offset || e.key === "Home" || e.key === "End") {
                e.preventDefault();
                navigate(TABS[next][0]);
                document.getElementById(`tab-${TABS[next][0]}`)?.focus();
              }
            }}
            onClick={() => navigate(id)}
          >
            <span className="tab-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            {name}
          </button>
        ))}
      </div>
      <main id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="intro">
          <div>
            <p className="eyebrow">FALL 2026 · D1–D4</p>
            <h1>
              {tab === "overview"
                ? "From sensing to feedback."
                : TABS.find(([id]) => id === tab)[1]}
            </h1>
            <p>
              {
                {
                  overview:
                    "Seven postures. Synchronized signals. One reproducible session.",
                  layout:
                    "Arrange the four forearm channels and dorsal hand IMU.",
                  signals: "Inspect raw waveforms and all six inertial axes.",
                  logic:
                    "Follow the quality gates from a prediction to feedback.",
                  log: "Review the timeline, annotate observations, and export your session.",
                  hand: "Explore connected joints, motion response, and object contact.",
                }[tab]
              }
            </p>
          </div>
          <div className="session-status">
            <i className={running ? "on" : ""} />
            {running
              ? "Recording simulation"
              : replay
                ? "Session replay"
                : "Ready to explore"}
          </div>
        </div>
        <aside className="notice">
          {b.session.provenance === "synthetic"
            ? "Signals, confidence, and prediction latency are generated test values. They are not hardware measurements or classifier results."
            : b.session.provenance === "legacy_unverified"
              ? "Legacy IMU import: raw EMG and sensor validity are unavailable. Reserved v1 EMG is not treated as a recording."
              : "Imported metadata describes this recording. Verify its provenance against the original acquisition record."}
        </aside>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <section className="controls panel">
          <label>
            Participant ID
            <input
              value={participant}
              onChange={(e) => setParticipant(e.target.value)}
              disabled={running}
            />
          </label>
          <label>
            Session ID
            <input
              value={session}
              onChange={(e) => setSession(e.target.value)}
              disabled={running}
            />
          </label>
          <label>
            Randomization seed
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              disabled={running}
            />
          </label>
          <button
            className="primary"
            onClick={start}
            disabled={running || busy}
          >
            {b.emg.length || b.imu.length
              ? "New simulation"
              : "Start simulation"}
          </button>
          <button onClick={stop} disabled={!running}>
            Stop
          </button>
          <button
            onClick={exportZip}
            disabled={running || busy || !b.session.duration_us}
          >
            {busy ? "Working…" : "Export session ZIP"}
          </button>
          <label className={`file-button ${running || busy ? "disabled" : ""}`}>
            Import ZIP / v1 CSV
            <input
              type="file"
              accept=".zip,.csv"
              onChange={importFile}
              disabled={running || busy}
            />
          </label>
          {download && (
            <a
              className="file-button"
              href={download.url}
              download={download.name}
            >
              Download prepared ZIP
            </a>
          )}
        </section>
        <div className="metrics">
          <div className="panel">
            <small>SESSION TIME</small>
            <strong>
              {(t / 1e6).toFixed(1)} <em>s</em>
            </strong>
          </div>
          <div className="panel">
            <small>EMG · 4 CHANNELS</small>
            <strong>
              {quality.received_hz.toFixed(0)} <em>samples/s</em>
            </strong>
          </div>
          <div className="panel">
            <small>IMU SAMPLES</small>
            <strong>{imu.length.toLocaleString()}</strong>
          </div>
          <div className="panel">
            <small>EMG MISSING / CLIPPED</small>
            <strong>
              {(quality.missing_fraction * 100).toFixed(2)} /{" "}
              {(quality.clipped_fraction * 100).toFixed(2)} <em>%</em>
            </strong>
          </div>
        </div>
        {tab === "layout" && (
          <SensorLayout
            layout={layout}
            onChange={setLayout}
            recorded={b.session.duration_us > 0}
          />
        )}
        {tab === "logic" && (
          <CoachingLogic
            decision={decision}
            prediction={pred}
            target={cue?.target_posture}
            t={t}
            onFault={toggleFault}
            fault={fault}
            running={running}
          />
        )}
        <div hidden={tab !== "log"}>
          <DataLogs
            bundle={b}
            t={t}
            onNote={saveNote}
            onExport={exportZip}
            busy={busy}
            running={running}
          />
        </div>
        {visitedHand && (
          <div hidden={tab !== "hand"} className="embedded-hand">
            <Suspense fallback={<p>Loading hand mechanics…</p>}>
              <HandLab embedded active={tab === "hand"} sensorLayout={layout} />
            </Suspense>
          </div>
        )}
        <div className="hand-toggle" hidden={tab !== "overview"}>
          <label>
            <input
              type="checkbox"
              checked={showHand}
              onChange={(e) => setShowHand(e.target.checked)}
            />{" "}
            Show 3D posture illustration
          </label>
        </div>
        {showHand && tab === "overview" && (
          <Suspense fallback={<p>Loading 3D posture illustration…</p>}>
            <ExperimentHand
              target={cue?.target_posture}
              prediction={status?.label}
              stable={status?.stable}
            />
          </Suspense>
        )}
        <div
          className={`workspace ${tab === "signals" ? "signals-workspace" : ""}`}
          hidden={!["overview", "signals"].includes(tab)}
        >
          <section className="panel traces">
            <div className="section-title">
              <h2>Acquisition monitor</h2>
              <span className={recentBad && emg.length ? "warning" : "muted"}>
                {!emg.length
                  ? "No EMG data"
                  : recentBad
                    ? "Clipping / quality fault"
                    : b.session.provenance === "synthetic"
                      ? "Simulated ADC range OK"
                      : "Input quality gate passed"}
              </span>
            </div>
            <div className="trace-grid">
              {[1, 2, 3, 4].map((c, i) => (
                <Trace
                  key={c}
                  rows={emg}
                  field={`emg_ch${c}`}
                  title={`EMG ${c}`}
                  unit="counts"
                  color={["#0f766e", "#2563eb", "#7c3aed", "#c2410c"][i]}
                />
              ))}
            </div>
            <div className={tab === "signals" ? "trace-grid" : ""}>
              {(tab === "signals"
                ? ["ax", "ay", "az", "gx", "gy", "gz"]
                : ["ax"]
              ).map((field) => (
                <Trace
                  key={field}
                  rows={imu}
                  field={field}
                  title={`IMU ${field.startsWith("a") ? "acceleration" : "angular velocity"} ${field.at(-1).toUpperCase()}`}
                  unit={field.startsWith("a") ? "g" : "°/s"}
                  color={field.startsWith("a") ? "#334155" : "#9a6524"}
                />
              ))}
            </div>
            <p className="muted">
              Raw EMG at 2 kHz/channel · IMU at 100 Hz · display follows its own
              clock.
            </p>
          </section>
          <section className="panel cue-panel" hidden={tab === "signals"}>
            <p className="eyebrow">
              {cue?.event_type === "rest" ? "REST INTERVAL" : "TARGET POSTURE"}
            </p>
            <h2 className="posture">
              {label(cue?.target_posture || "neutral_rest")}
            </h2>
            <div className="countdown">
              {remaining}
              <small>seconds remaining</small>
            </div>
            <p>
              Repetition {cue?.repetition || 0} · {b.session.session_id}
            </p>
            <hr />
            <p className="eyebrow">PREDICTION OVERLAY</p>
            <h3>{label(status?.label)}</h3>
            <div className="confidence">
              <div style={{ width: `${(pred?.confidence || 0) * 100}%` }} />
            </div>
            <p>
              {((pred?.confidence || 0) * 100).toFixed(0)}% confidence ·{" "}
              {status?.stable ? "stable" : "waiting for stability"}
            </p>
            <p className="muted">{decision.message}</p>
            <button
              className={fault ? "fault active" : "fault"}
              disabled={!running}
              onClick={toggleFault}
            >
              {fault ? "Clear signal fault" : "Inject clipping fault"}
            </button>
            <small>
              Exercises the uncertain state using a simulated ADC rail fault.
            </small>
          </section>
        </div>
        <section
          className="panel replay-panel"
          hidden={!["overview", "log", "signals", "logic"].includes(tab)}
        >
          <div className="section-title">
            <h2>Replay & events</h2>
            <button
              disabled={running || !b.session.duration_us}
              onClick={() => {
                setReplay(true);
                setReplaying(!replaying);
                if (cursor >= b.session.duration_us) setCursor(0);
              }}
            >
              {replaying ? "Pause replay" : "Play replay"}
            </button>
          </div>
          <input
            aria-label="Replay position"
            type="range"
            min="0"
            max={b.session.duration_us || 1}
            step="10000"
            value={replay ? cursor : b.session.duration_us}
            disabled={running}
            onChange={(e) => {
              setReplay(true);
              setCursor(Number(e.target.value));
            }}
          />
          <div className="event-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Target</th>
                  <th>Repetition</th>
                </tr>
              </thead>
              <tbody>
                {b.events
                  .filter((e) => e.t_us <= t)
                  .slice(-8)
                  .reverse()
                  .map((e, i) => (
                    <tr key={i}>
                      <td>{(e.t_us / 1e6).toFixed(2)} s</td>
                      <td>{e.event_type}</td>
                      <td>{label(e.target_posture)}</td>
                      <td>{e.repetition}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer>
          Session bundle v2 · session.json + EMG, IMU, events, predictions CSV ·
          Raw data retained at full rate. Export before opening a new session.
        </footer>
      </main>
    </div>
  );
}
