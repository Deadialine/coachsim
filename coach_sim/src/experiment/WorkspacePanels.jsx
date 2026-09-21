import React, { useRef, useState } from "react";
import { CONFIG, toCSV } from "./core.mjs";
import { DEFAULT_LAYOUT, normalizeLayout } from "./workspace.mjs";

export function SensorLayout({ layout, onChange, recorded }) {
  const [selected, setSelected] = useState("emg_ch1");
  const svg = useRef(null),
    drag = useRef(null);
  const site = layout.find((s) => s.id === selected);
  const change = (patch) =>
    onChange(
      normalizeLayout(
        layout.map((s) => (s.id === selected ? { ...s, ...patch } : s)),
      ),
    );
  const origin = (s) => ({
    x: s.surface === "dorsal" ? 340 : 60,
    y: s.id === "imu" ? 64 : 235,
    w: 140,
    h: s.id === "imu" ? 110 : 210,
  });
  function move(event) {
    if (!drag.current) return;
    const point = svg.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const p = point.matrixTransform(svg.current.getScreenCTM().inverse()),
      s = layout.find((s) => s.id === drag.current),
      o = origin(s);
    onChange(
      normalizeLayout(
        layout.map((item) =>
          item.id === s.id
            ? {
                ...item,
                x: ((p.x - o.x) / o.w) * 100,
                y: ((p.y - o.y) / o.h) * 100,
              }
            : item,
        ),
      ),
    );
  }
  return (
    <section className="panel layout-panel">
      <h2>Interactive sensor layout</h2>
      <p className="muted">
        Drag a site, use its arrow keys, or edit the position below. Positions
        are schematic percentages within the forearm or hand region, not
        anatomical measurements. This draft is captured when you start the next
        session.
      </p>
      <div className="layout-editor">
        <svg
          ref={svg}
          viewBox="0 0 560 500"
          aria-label="Palmar and dorsal sensor placement diagram"
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {[
            ["palmar", 60],
            ["dorsal", 340],
          ].map(([surface, x]) => (
            <g key={surface}>
              <text x={x + 70} y="25" textAnchor="middle">
                {surface.toUpperCase()}
              </text>
              <rect
                x={x}
                y="65"
                width="140"
                height="135"
                rx="35"
                fill="#e0ece7"
                stroke="#91b4a8"
              />
              <path
                d={`M${x + 14} 200 L${x + 5} 458 Q${x + 70} 478 ${x + 135} 458 L${x + 126} 200`}
                fill="#edf3ed"
                stroke="#91b4a8"
              />
              {[20, 53, 86, 119].map((dx, i) => (
                <rect
                  key={dx}
                  x={x + dx - 10}
                  y={46 - (i % 2) * 9}
                  width="20"
                  height="55"
                  rx="10"
                  fill="#e0ece7"
                  stroke="#91b4a8"
                />
              ))}
              <text x={x + 70} y="490" textAnchor="middle">
                Forearm
              </text>
            </g>
          ))}
          {layout.map((s) => {
            const o = origin(s),
              x = o.x + (s.x / 100) * o.w,
              y = o.y + (s.y / 100) * o.h;
            return (
              <g
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`Move ${s.name} sensor`}
                transform={`translate(${x},${y})`}
                className={selected === s.id ? "site selected" : "site"}
                onPointerDown={(e) => {
                  setSelected(s.id);
                  drag.current = s.id;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (
                    [
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    setSelected(s.id);
                    onChange(
                      normalizeLayout(
                        layout.map((item) =>
                          item.id === s.id
                            ? {
                                ...item,
                                x:
                                  item.x +
                                  (e.key === "ArrowRight"
                                    ? 2
                                    : e.key === "ArrowLeft"
                                      ? -2
                                      : 0),
                                y:
                                  item.y +
                                  (e.key === "ArrowDown"
                                    ? 2
                                    : e.key === "ArrowUp"
                                      ? -2
                                      : 0),
                              }
                            : item,
                        ),
                      ),
                    );
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(s.id);
                  }
                }}
              >
                <circle r="15" fill={s.id === "imu" ? "#d69b4b" : "#177965"} />
                <text y="4" textAnchor="middle" fill="white">
                  {s.id === "imu" ? "I" : s.name.at(-1)}
                </text>
                <text y="32" textAnchor="middle">
                  {s.name}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="site-controls">
          <label>
            Selected sensor
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {layout.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Surface
            <select
              value={site.surface}
              disabled={site.id === "imu"}
              onChange={(e) => change({ surface: e.target.value })}
            >
              <option value="palmar">Palmar forearm</option>
              <option value="dorsal">
                Dorsal {site.id === "imu" ? "hand" : "forearm"}
              </option>
            </select>
          </label>
          {["x", "y"].map((axis) => (
            <label key={axis}>
              {axis === "x" ? "Across region" : "Along region"} (%)
              <input
                aria-label={`Sensor ${axis} position`}
                type="number"
                min="10"
                max="90"
                step="1"
                value={Math.round(site[axis])}
                onChange={(e) => change({ [axis]: Number(e.target.value) })}
              />
            </label>
          ))}
          <button onClick={() => onChange(normalizeLayout(DEFAULT_LAYOUT))}>
            Reset draft layout
          </button>
          <p className="muted">
            Four bipolar MyoWare RAW channels: 2 kHz/channel. One dorsal-hand
            MPU6050: 100 Hz. DS1307 is clock metadata; ESP32 acquisition is
            planned.
          </p>
          <p className="muted">
            {recorded
              ? "The current session keeps its original placement snapshot; edits apply to the next session."
              : "Starting a simulation freezes a copy of this layout in session.json."}
          </p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Sensor</th>
            <th>Planned location</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {layout.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.id === "imu" ? "MPU6050" : "MyoWare RAW"}</td>
              <td>
                {s.surface} {s.id === "imu" ? "hand" : "forearm"}
              </td>
              <td>
                {s.id === "imu" ? "ax, ay, az · gx, gy, gz" : "Raw ADC counts"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CoachingLogic({
  decision,
  prediction,
  target,
  t,
  onFault,
  fault,
  running,
}) {
  const names = {
    quality: "Raw signal + prediction quality",
    confidence: `Confidence ≥ ${CONFIG.confidence_min * 100}%`,
    freshness: "Prediction age ≤ 250 ms",
    recognized: "One of the seven study classes",
    stability: `Stable label ≥ ${CONFIG.stability_us / 1000} ms`,
  };
  return (
    <section className="panel logic-panel">
      <h2>Coaching logic</h2>
      <p className="muted">
        One shared decision drives this rule view and the overview feedback. All
        current model confidence and predictions are synthetic test values. No
        physiological safety, fatigue, or clinical decisions are inferred.
      </p>
      <div className="logic-inputs">
        <div>
          <small>Target</small>
          <strong>{target?.replaceAll("_", " ") ?? "Waiting"}</strong>
        </div>
        <div>
          <small>Prediction</small>
          <strong>
            {prediction?.predicted_posture?.replaceAll("_", " ") ?? "None"}
          </strong>
        </div>
        <div>
          <small>Confidence / age</small>
          <strong>
            {prediction
              ? `${Math.round(prediction.confidence * 100)}% / ${((t - prediction.t_us) / 1000).toFixed(0)} ms`
              : "—"}
          </strong>
        </div>
      </div>
      <ol className="gate-list">
        {Object.entries(decision.gates).map(([key, pass]) => (
          <li key={key} className={pass ? "passed" : "waiting"}>
            <span>{names[key]}</span>
            <strong>{pass ? "PASS" : "WAIT / FAIL"}</strong>
          </li>
        ))}
      </ol>
      <div className="coaching-output" role="status">
        <strong>{decision.state}</strong>
        <p>{decision.message}</p>
      </div>
      <div className="logic-states">
        {[
          "WAITING",
          "UNCERTAIN",
          "SETTLING",
          "REST",
          "ADJUST",
          "HOLD",
          "COMPLETE",
        ].map((state) => (
          <span
            key={state}
            className={state === decision.state ? "active" : ""}
          >
            {state}
          </span>
        ))}
      </div>
      <button disabled={!running} onClick={onFault}>
        {fault ? "Clear signal fault" : "Inject clipping fault"}
      </button>
      <p className="muted">
        LDA is the planned primary classifier; RBF SVM is the comparison.
        Thresholds are fixed to the study configuration. Finger motion,
        grip-force estimates, heart rate, respiration, and haptic cues are
        outside the current protocol.
      </p>
    </section>
  );
}

export function DataLogs({ bundle, t, onNote, onExport, busy, running }) {
  const [text, setText] = useState(""),
    [filter, setFilter] = useState(""),
    [noteError, setNoteError] = useState("");
  const [csv, setCsv] = useState(null);
  React.useEffect(
    () => () => {
      if (csv) URL.revokeObjectURL(csv.url);
    },
    [csv],
  );
  React.useEffect(() => {
    setCsv(null);
    setText("");
    setNoteError("");
  }, [bundle]);
  const notes = (
    Array.isArray(bundle.session.operator_notes)
      ? bundle.session.operator_notes
      : []
  ).filter((n) => n && Number.isFinite(n.t_us) && typeof n.text === "string");
  const rows = [
    ...bundle.events.map((e) => ({
      ...e,
      kind: e.event_type,
      text: e.target_posture?.replaceAll("_", " ") ?? "",
    })),
    ...notes.map((n) => ({ ...n, kind: "operator note" })),
  ]
    .filter(
      (r) =>
        r.t_us <= t &&
        `${r.kind} ${r.text}`.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) => b.t_us - a.t_us);
  function exportNotes() {
    const url = URL.createObjectURL(
      new Blob([toCSV(notes, ["t_us", "kind", "target", "text"])], {
        type: "text/csv",
      }),
    );
    setCsv({
      url,
      name: `${bundle.session.session_id.replace(/[^a-zA-Z0-9_-]/g, "_")}-notes.csv`,
    });
  }
  const latest = (rows) => {
    let lo = 0,
      hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].t_us <= t) lo = mid + 1;
      else hi = mid;
    }
    return rows[lo - 1] ?? null;
  };
  return (
    <section className="panel logs-panel">
      <h2>Data logs & operator notes</h2>
      <p className="muted">
        Events and notes follow the shared session/replay cursor. Notes annotate
        a session time; they do not alter raw measurements. Export the session
        before starting another or leaving the page.
      </p>
      <div className="notes-editor">
        <label>
          Operator note
          <textarea
            maxLength="1500"
            rows="3"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Placement observation, trial issue, or replay annotation…"
          />
        </label>
        <button
          disabled={!bundle.session.duration_us || !text.trim()}
          onClick={() => {
            try {
              onNote(text);
              setText("");
              setNoteError("");
              setCsv(null);
            } catch (e) {
              setNoteError(e.message);
            }
          }}
        >
          Add note at {(t / 1e6).toFixed(2)} s
        </button>
        {noteError && <p role="alert">{noteError}</p>}
      </div>
      <div className="log-actions">
        <button
          onClick={onExport}
          disabled={running || busy || !bundle.session.duration_us}
        >
          Export full session ZIP
        </button>
        <button onClick={exportNotes} disabled={!notes.length}>
          Prepare notes CSV
        </button>
        {csv && (
          <a href={csv.url} download={csv.name}>
            Download notes CSV
          </a>
        )}
        <label>
          Filter events / notes
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search this session"
          />
        </label>
      </div>
      <div className="event-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Posture / note</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row, i) => (
              <tr key={i}>
                <td>{(row.t_us / 1e6).toFixed(2)} s</td>
                <td>{row.kind}</td>
                <td className="note-text">{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>No matching events or notes at this cursor.</p>}
        <p className="muted">
          Showing {Math.min(rows.length, 100)} of {rows.length} matching
          entries. The full ZIP retains all entries and notes.
        </p>
      </div>
      <details>
        <summary>Latest synchronized raw rows</summary>
        <pre>
          {JSON.stringify(
            {
              cursor_us: t,
              emg: latest(bundle.emg),
              imu: latest(bundle.imu),
              prediction: latest(bundle.predictions),
            },
            null,
            2,
          )}
        </pre>
      </details>
      <details>
        <summary>Recorded placement snapshot</summary>
        <pre>{JSON.stringify(bundle.session.placement_metadata, null, 2)}</pre>
      </details>
    </section>
  );
}
