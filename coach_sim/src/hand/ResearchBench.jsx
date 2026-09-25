import React, { useState } from "react";
import { TRIALS, AXES } from "./trials.mjs";
import {
  compareOrientations,
  referenceCSV,
  validationDemo,
} from "./validation.mjs";
import { downloadJSON } from "./OrientationPanel";
const names = {
  flex: "Wrist bend",
  deviation: "Wrist deviation",
  rotation: "Forearm rotation",
};
function Plot({ series, label, unit = "°" }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length)
    return <p className="help">Run a trial to see the response.</p>;
  const bounds = all.reduce(
    (b, p) => ({
      xmin: Math.min(b.xmin, p[0]),
      xmax: Math.max(b.xmax, p[0]),
      lo: Math.min(b.lo, p[1]),
      hi: Math.max(b.hi, p[1]),
    }),
    { xmin: Infinity, xmax: -Infinity, lo: 0, hi: 1 },
  );
  const { xmin, xmax, lo, hi } = bounds;
  const envelope = (points) => {
    const size = Math.ceil(points.length / 500),
      out = [];
    for (let i = 0; i < points.length; i += size) {
      const bucket = points.slice(i, i + size);
      let low = bucket[0],
        high = bucket[0];
      for (const p of bucket) {
        if (p[1] < low[1]) low = p;
        if (p[1] > high[1]) high = p;
      }
      out.push(...[low, high].sort((a, b) => a[0] - b[0]));
    }
    return out;
  };
  const x = (t) => 40 + ((t - xmin) / (xmax - xmin || 1)) * 490,
    y = (v) => 155 - ((v - lo) / (hi - lo)) * 125;
  return (
    <figure className="bench-plot">
      <svg viewBox="0 0 550 190" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="40"
              x2="530"
              y1={30 + f * 125}
              y2={30 + f * 125}
              stroke="#36555c"
            />
            <text x="2" y={34 + f * 125}>
              {(hi - f * (hi - lo)).toFixed(0)}
              {unit}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={s.dashed ? "5 4" : undefined}
            points={envelope(s.points)
              .map((p) => `${x(p[0])},${y(p[1])}`)
              .join(" ")}
          />
        ))}
        <text x="40" y="181">
          {xmin.toFixed(1)} s
        </text>
        <text x="487" y="181">
          {xmax.toFixed(1)} s
        </text>
      </svg>
      <figcaption>
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
export default function ResearchBench({
  disabled,
  trial,
  report,
  paused,
  onStart,
  onStop,
  onPause,
  imuData,
}) {
  const [tab, setTab] = useState("trials"),
    [scenario, setScenario] = useState("postures"),
    [axis, setAxis] = useState("flex"),
    [source, setSource] = useState(null),
    [reference, setReference] = useState(null),
    [offset, setOffset] = useState("0"),
    [comparison, setComparison] = useState(null),
    [error, setError] = useState("");
  const busy = !!trial && !report?.complete;
  function compare() {
    try {
      const offsetMs = Number(offset);
      if (!offset.trim() || !Number.isFinite(offsetMs))
        throw Error("Enter a finite clock offset in milliseconds.");
      if (!source || !reference)
        throw Error("Choose estimates and load a reference first.");
      setComparison({
        ...compareOrientations(source.estimates, reference.rows, {
          offsetUs: offsetMs * 1000,
        }),
        estimateProvenance: source.provenance,
        referenceProvenance: reference.provenance,
        sourceFilter: source.filter ?? "coachsim-complementary-1",
        headingAlignment: "none",
        frame: "hand-to-world, world +Y up",
        estimates: source.estimates,
        reference: reference.rows,
      });
      setError("");
    } catch (e) {
      setComparison(null);
      setError(e.message);
    }
  }
  return (
    <section className="research-bench" aria-label="Research benchmark lab">
      <div className="section-title">
        <div>
          <p className="eyebrow">RESEARCH BENCH / REPEAT · MEASURE · COMPARE</p>
          <h2>Make every improvement measurable.</h2>
        </div>
        <span>Software evidence</span>
      </div>
      <div
        className="bench-tabs"
        role="tablist"
        aria-label="Research bench tools"
      >
        <button
          role="tab"
          aria-selected={tab === "trials"}
          onClick={() => setTab("trials")}
        >
          Motion trials
        </button>
        <button
          role="tab"
          aria-selected={tab === "accuracy"}
          onClick={() => setTab("accuracy")}
        >
          Orientation accuracy
        </button>
      </div>
      {tab === "trials" ? (
        <div role="tabpanel" aria-label="Motion trials">
          <label className="bench-field">
            Trial protocol
            <select
              value={scenario}
              disabled={busy}
              onChange={(e) => setScenario(e.target.value)}
            >
              {Object.entries(TRIALS).map(([id, t]) => (
                <option value={id} key={id}>
                  {t.title} · {t.seconds} s
                </option>
              ))}
            </select>
          </label>
          <p>
            {TRIALS[scenario].description} Starts from a fresh model at the
            applied forearm placement. Uses current finger settings, motor
            strength and gravity; the free ball is excluded.
          </p>
          <div className="grip-buttons">
            <button
              disabled={disabled || busy}
              onClick={() => onStart(scenario)}
            >
              Run motion trial
            </button>
            {trial && (
              <>
                <button disabled={report?.complete} onClick={onPause}>
                  {paused ? "Resume trial" : "Pause trial"}
                </button>
                <button onClick={onStop}>Return to manual physics</button>
              </>
            )}
            <button
              disabled={!report?.complete}
              onClick={() => downloadJSON("coachsim-motion-trial.json", report)}
            >
              Export complete trial
            </button>
          </div>
          {disabled && (
            <p className="help">
              Apply a manual placement to leave IMU observation before running a
              physics trial.
            </p>
          )}
          <p role="status">
            {report
              ? `${report.error ? "Stopped: " + report.error : report.complete ? "Complete" : !trial ? "Stopped (incomplete)" : paused ? "Paused" : "Running"} · ${report.seconds.toFixed(2)} / ${(report.totalSteps / 120).toFixed(0)} simulated seconds`
              : "Ready · fixed 120 Hz sampling"}
          </p>
          {report && (
            <>
              <progress
                aria-label="Motion trial progress"
                value={report.steps}
                max={report.totalSteps}
              />
              <div className="bench-metrics">
                {AXES.map((k) => (
                  <div key={k}>
                    <span>{names[k]} target RMSE</span>
                    <strong>
                      {report.summary.rmseDeg[k]?.toFixed(2) ?? "—"}°
                    </strong>
                    <small>
                      Smoothed command:{" "}
                      {report.summary.commandRmseDeg[k]?.toFixed(2) ?? "—"}°
                      RMSE
                    </small>
                  </div>
                ))}
                <div>
                  <span>Maximum connection error</span>
                  <strong>{report.summary.maxAnchorMm.toFixed(4)} mm</strong>
                </div>
              </div>
              <label className="bench-field">
                Response axis
                <select value={axis} onChange={(e) => setAxis(e.target.value)}>
                  {AXES.map((k) => (
                    <option key={k} value={k}>
                      {names[k]}
                    </option>
                  ))}
                </select>
              </label>
              <Plot
                label={`${names[axis]} target and actual response`}
                series={[
                  {
                    name: "Target",
                    color: "#f3c484",
                    dashed: true,
                    points: report.rows.map((r) => [r.t_s, r.targets[axis]]),
                  },
                  {
                    name: "Smoothed command",
                    color: "#9fafff",
                    points: report.rows.map((r) => [r.t_s, r.commands[axis]]),
                  },
                  {
                    name: "Actual",
                    color: "#73e1cb",
                    points: report.rows.map((r) => [r.t_s, r.angles[axis]]),
                  },
                ]}
              />
            </>
          )}
          <p className="help">
            RMSE includes commanded transitions, not just settled holds. It
            measures controller tracking in this engineering model, not
            participant accuracy. Partial runs cannot be exported as completed
            trials. Background time is not simulated.
          </p>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Orientation accuracy">
          <p>
            Compare hand-to-world quaternion estimates with a timestamped
            independent reference. World +Y is up. The comparison never silently
            aligns heading or extrapolates beyond the reference.
          </p>
          <div className="grip-buttons">
            <button
              onClick={() => {
                const demo = validationDemo();
                setSource({ ...demo, provenance: demo.provenance });
                setReference({
                  rows: demo.reference,
                  provenance: "synthetic known trajectory",
                });
                setComparison(null);
                setOffset("0");
                setError("");
              }}
            >
              Load noisy synthetic benchmark
            </button>
            <button
              disabled={!imuData?.estimates?.some((e) => e.q)}
              onClick={() => {
                setSource(imuData);
                setReference(null);
                setOffset("0");
                setComparison(null);
                setError("");
              }}
            >
              Use current IMU recording
            </button>
          </div>
          <p className="help">
            Estimates: {source?.provenance ?? "none"}. Reference:{" "}
            {reference?.provenance ?? "none"}.
          </p>
          <label className="imu-file">
            Import reference CSV
            <input
              aria-label="Import reference CSV"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) {
                  try {
                    if (file.size > 10_000_000)
                      throw Error("Reference exceeds 10 MB.");
                    setReference({
                      rows: referenceCSV(await file.text()),
                      provenance: "imported independent reference · unverified",
                    });
                    setComparison(null);
                    setError("");
                  } catch (err) {
                    setComparison(null);
                    setReference(null);
                    setError(err.message);
                  }
                }
                e.target.value = "";
              }}
            />
          </label>
          <p className="help">
            Columns: t_us,qx,qy,qz,qw. Same hand and world frames as the
            estimates; sensor mounting must already be calibrated. Reference
            gaps above 50 ms are excluded.
          </p>
          <label className="bench-field">
            Reference clock offset (ms)
            <input
              aria-label="Reference clock offset (ms)"
              type="number"
              step="1"
              value={offset}
              onChange={(e) => {
                setOffset(e.target.value);
                setComparison(null);
              }}
            />
          </label>
          <p className="help">
            Reference time = estimate time + offset. Determine the offset from
            synchronization evidence; tuning it to minimize error biases the
            result.
          </p>
          <div className="grip-buttons">
            <button onClick={compare}>Evaluate orientation accuracy</button>
            <button
              disabled={!comparison}
              onClick={() =>
                downloadJSON("coachsim-orientation-comparison.json", comparison)
              }
            >
              Export comparison
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {comparison && (
            <>
              <div className="bench-metrics">
                <div>
                  <span>3D rotation RMSE</span>
                  <strong>{comparison.orientationDeg.rmse.toFixed(2)}°</strong>
                </div>
                <div>
                  <span>Tilt RMSE</span>
                  <strong>{comparison.tiltDeg.rmse.toFixed(2)}°</strong>
                </div>
                <div>
                  <span>95th percentile error</span>
                  <strong>{comparison.orientationDeg.p95.toFixed(2)}°</strong>
                </div>
                <div>
                  <span>Sample coverage</span>
                  <strong>{(comparison.coverage * 100).toFixed(1)}%</strong>
                </div>
              </div>
              <p className="help">
                {comparison.matchedSamples} matched of{" "}
                {comparison.estimatedSamples} estimated samples.{" "}
                {comparison.calibrationSamplesExcluded} calibration samples
                excluded. Maximum orientation error{" "}
                {comparison.orientationDeg.max.toFixed(2)}°.{" "}
                {comparison.coverage < 0.95
                  ? "Incomplete coverage: inspect excluded intervals before drawing conclusions."
                  : ""}
              </p>
              <Plot
                label="Orientation and tilt error over time"
                series={[
                  {
                    name: "3D rotation error",
                    color: "#f3c484",
                    points: comparison.rows.map((r) => [
                      (r.t_us - comparison.rows[0].t_us) / 1e6,
                      r.orientationDeg,
                    ]),
                  },
                  {
                    name: "Tilt error",
                    color: "#73e1cb",
                    points: comparison.rows.map((r) => [
                      (r.t_us - comparison.rows[0].t_us) / 1e6,
                      r.tiltDeg,
                    ]),
                  },
                ]}
              />
            </>
          )}
          <p className="help">
            Synthetic results exercise the software only. Accuracy claims need
            real synchronized reference recordings and a prespecified acceptance
            threshold.
          </p>
        </div>
      )}
    </section>
  );
}
