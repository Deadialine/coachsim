import React, { useEffect, useRef, useState } from "react";
import {
  createRobot,
  initPhysics,
  ROBOT_DT,
  DEFAULT_DRIVE,
} from "./physics.mjs";
import { homeTargets } from "./model.mjs";
import { fromEuler } from "../hand/frames.mjs";
import { createRobotScene } from "./scene.mjs";
import { createResponseTrial } from "./trial.mjs";
import { downloadJSON } from "../hand/OrientationPanel";
import "./robot.css";
const root = `${import.meta.env.BASE_URL}models/allegro/`;
const names = [
  "Index · spread",
  "Index · proximal",
  "Index · middle",
  "Index · distal",
  "Middle · spread",
  "Middle · proximal",
  "Middle · middle",
  "Middle · distal",
  "Ring · spread",
  "Ring · proximal",
  "Ring · middle",
  "Ring · distal",
  "Thumb · base",
  "Thumb · proximal",
  "Thumb · middle",
  "Thumb · distal",
];
export default function RobotLab({ active = true }) {
  const [manifest, setManifest] = useState(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState(1),
    [targets, setTargets] = useState([]),
    [snapshot, setSnapshot] = useState(null),
    [paused, setPaused] = useState(false),
    [motors, setMotors] = useState(true),
    [gravity, setGravity] = useState(true),
    [colliders, setColliders] = useState(false),
    [placement, setPlacement] = useState("upright"),
    [drive, setDrive] = useState({ ...DEFAULT_DRIVE }),
    [version, setVersion] = useState(0),
    [trialIndex, setTrialIndex] = useState(null),
    [report, setReport] = useState(null);
  const host = useRef(null),
    current = useRef({});
  current.current = { active, selected, targets, paused, motors, colliders };
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${root}manifest.json`, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("Robot model could not be loaded.");
        return r.json();
      })
      .then((m) => {
        setManifest(m);
        setTargets(homeTargets(m));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!manifest) return;
    const abort = new AbortController();
    let cancelled = false,
      frame,
      model,
      scene;
    setReady(false);
    setSnapshot(null);
    setError("");
    (async () => {
      try {
        await initPhysics();
        if (cancelled) return;
        model = createRobot(manifest, {
          gravity,
          drive,
          orientation: fromEuler(
            placement === "upright"
              ? { yaw: 90 }
              : placement === "inverted"
                ? { yaw: -90 }
                : placement === "palm-up"
                  ? { roll: -90 }
                  : {},
          ),
        });
        scene = await createRobotScene(host.current, model, root, abort.signal);
        if (cancelled) {
          scene.dispose();
          model.dispose();
          return;
        }
        const trial =
          trialIndex === null
            ? null
            : createResponseTrial(model, manifest, trialIndex);
        let reported = false,
          last = performance.now(),
          acc = 0,
          lastReport = 0;
        setReady(true);
        function tick(now) {
          if (cancelled) return;
          try {
            const c = current.current,
              elapsed = Math.min(0.05, Math.max(0, (now - last) / 1000));
            last = now;
            if (c.active && !document.hidden) {
              if (!c.paused && (!trial || !trial.complete)) {
                acc += elapsed;
                while (acc >= ROBOT_DT) {
                  if (trial) trial.advance();
                  else model.step(c.targets, c.motors);
                  acc -= ROBOT_DT;
                }
              } else acc = 0;
              if (trial?.complete && !reported) {
                reported = true;
                setReport(trial.report());
                setPaused(true);
              }
              scene.draw({ selected: c.selected, colliders: c.colliders });
              if (now - lastReport > 150) {
                setSnapshot(model.snapshot());
                lastReport = now;
              }
            } else acc = 0;
            frame = requestAnimationFrame(tick);
          } catch (e) {
            setError(e.message);
            setReady(false);
          }
        }
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) setError(e.message);
        model?.dispose();
        model = null;
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      cancelAnimationFrame(frame);
      if (scene) {
        scene.dispose();
        model?.dispose();
      }
    };
  }, [manifest, version, gravity, placement, drive, trialIndex]);
  const running = trialIndex !== null && !report,
    joint = manifest?.joints[selected],
    state = snapshot?.joints[selected];
  const displayedTargets =
    trialIndex === null || !manifest
      ? targets
      : homeTargets(manifest).map((q, i) =>
          i === trialIndex && (snapshot?.simulationSeconds ?? 0) > 1
            ? Math.min(q + 0.4, manifest.joints[i].rangeRad[1])
            : q,
        );
  function restart() {
    setReport(null);
    setTrialIndex(null);
    setPaused(false);
    setTargets(homeTargets(manifest));
    setVersion((v) => v + 1);
  }
  function responseTest() {
    setReport(null);
    setPaused(false);
    setMotors(true);
    setTrialIndex(selected);
    setVersion((v) => v + 1);
  }
  return (
    <section className="robot-lab" aria-label="Allegro robot laboratory">
      <header className="robot-heading">
        <div>
          <p className="eyebrow">ROBOT MODEL / MILESTONE 02</p>
          <h1>
            A real robot’s geometry.
            <br />
            An inspectable simulation.
          </h1>
          <p>
            Allegro Hand V3 · right hand · four fingers · 16 independent
            actuators
          </p>
        </div>
        <span className="robot-status">
          {error
            ? "MODEL UNAVAILABLE"
            : ready
              ? "MODEL READY"
              : "LOADING MODEL"}
        </span>
      </header>
      <p className="robot-boundary">
        Open reference model from MuJoCo Menagerie. Link inertia comes from the
        source mesh-density model. Controller settings are simulation
        assumptions awaiting physical calibration. This robot is separate from
        the thesis hand and its 4 sEMG + 1 IMU channels.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="robot-layout">
        <div className="robot-stage">
          <div className="robot-canvas" ref={host} />
          <div className="robot-caption">
            <span>CAD geometry · 240 Hz physics</span>
            <span>Drag to orbit · scroll to zoom</span>
          </div>
          <div className="robot-metrics">
            <span>
              <b>{manifest?.bodies.length ?? "—"}</b> rigid links
            </span>
            <span>
              <b>
                {manifest
                  ? (
                      manifest.bodies.reduce((s, b) => s + b.massKg, 0) * 1000
                    ).toFixed(1)
                  : "—"}{" "}
                g
              </b>{" "}
              source model mass
            </span>
            <span>
              <b>
                {snapshot
                  ? Math.max(
                      ...snapshot.joints.map((j) => j.anchorErrorM * 1000),
                    ).toFixed(3)
                  : "—"}{" "}
                mm
              </b>{" "}
              max anchor error
            </span>
          </div>
          <p className="robot-footnote">
            Amber arrow: selected joint axis. Grid: visual reference, not a
            collision floor. Fixed palm support; finger self-contact enabled.
          </p>
        </div>
        <aside className="robot-controls">
          <p className="eyebrow">ACTUATOR INSPECTOR</p>
          <h2>Command. Observe. Compare.</h2>
          <label>
            Actuator
            <select
              aria-label="Robot actuator"
              value={selected}
              disabled={running}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {names.map((n, i) => (
                <option value={i} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="robot-joint-id">
            {joint?.id} → {joint?.body}
          </div>
          <label>
            Target{" "}
            <output>
              {(((displayedTargets[selected] ?? 0) * 180) / Math.PI).toFixed(1)}
              °
            </output>
            <input
              aria-label="Robot joint target"
              type="range"
              min={joint?.rangeRad[0] ?? 0}
              max={joint?.rangeRad[1] ?? 1}
              step="0.001"
              value={displayedTargets[selected] ?? 0}
              disabled={!ready || trialIndex !== null}
              onChange={(e) =>
                setTargets((t) =>
                  t.map((q, i) =>
                    i === selected ? Number(e.target.value) : q,
                  ),
                )
              }
            />
          </label>
          <div className="robot-readouts">
            <span>
              Actual angle
              <strong>
                {state ? ((state.positionRad * 180) / Math.PI).toFixed(1) : "—"}
                °
              </strong>
            </span>
            <span>
              Applied torque
              <strong>{state ? state.torqueNm.toFixed(4) : "—"} N·m</strong>
            </span>
            <span>
              Angular velocity
              <strong>
                {state ? state.velocityRadS.toFixed(3) : "—"} rad/s
              </strong>
            </span>
            <span>
              Torque limit
              <strong>{state?.saturated ? "AT LIMIT" : "Within limit"}</strong>
            </span>
          </div>
          <p className="robot-footnote">
            Source range:{" "}
            {joint?.rangeRad
              .map((v) => ((v * 180) / Math.PI).toFixed(1))
              .join(" to ")}
            °. Targets change at a bounded rate; actual speed can differ under
            load.
          </p>
          <div className="robot-buttons">
            <button disabled={!ready || running} onClick={restart}>
              Reset to home
            </button>
            <button disabled={!ready} onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume robot" : "Pause robot"}
            </button>
          </div>
          <fieldset disabled={!ready || running}>
            <legend>Scene configuration · restarts model</legend>
            <label>
              Mount orientation
              <select
                aria-label="Robot mount orientation"
                value={placement}
                onChange={(e) => {
                  setPlacement(e.target.value);
                  setReport(null);
                  setTrialIndex(null);
                  setPaused(false);
                }}
              >
                <option value="upright">Upright</option>
                <option value="inverted">Inverted</option>
                <option value="horizontal">Horizontal</option>
                <option value="palm-up">Palm up</option>
              </select>
            </label>
            <label className="robot-check">
              <input
                type="checkbox"
                checked={gravity}
                onChange={(e) => {
                  setGravity(e.target.checked);
                  setReport(null);
                  setTrialIndex(null);
                  setPaused(false);
                }}
              />
              World gravity
            </label>
          </fieldset>
          <label className="robot-check">
            <input
              type="checkbox"
              checked={colliders}
              onChange={(e) => setColliders(e.target.checked)}
            />
            Show collision geometry
          </label>
          <label className="robot-check">
            <input
              type="checkbox"
              checked={motors}
              disabled={trialIndex !== null}
              onChange={(e) => setMotors(e.target.checked)}
            />
            Enable bounded joint drives
          </label>
          <details>
            <summary>Actuator assumptions</summary>
            <p className="robot-footnote">
              These are editable software limits, not certified Allegro
              specifications. Changes rebuild the model.
            </p>
            <fieldset disabled={!ready || running}>
              {[
                ["maxTorqueNm", "Torque cap (N·m)", 0.01, 0.5, 0.01],
                ["commandRateRadS", "Command rate (rad/s)", 0.1, 5, 0.1],
              ].map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}: {drive[key]}
                  <input
                    type="range"
                    aria-label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={drive[key]}
                    onChange={(e) => {
                      setDrive((d) => ({
                        ...d,
                        [key]: Number(e.target.value),
                      }));
                      setReport(null);
                      setTrialIndex(null);
                      setPaused(false);
                    }}
                  />
                </label>
              ))}
            </fieldset>
            <p className="robot-footnote">
              Kp = {drive.kp} N·m/rad; Kd = {drive.kd} N·m·s/rad. Implicit PD
              with a link-based mass matrix; external contact forces are not
              predicted.
            </p>
          </details>
        </aside>
      </div>
      <section className="robot-response" aria-label="Robot response bench">
        <div>
          <p className="eyebrow">REPEATABLE RESPONSE / 04 SECONDS</p>
          <h2>Measure the selected actuator.</h2>
          <p>
            Start at home, hold for one second, then command +0.4 rad for three
            seconds. Records all joint angles, velocities, applied torques and
            connection errors at 240 Hz.
          </p>
          <button disabled={!ready || running} onClick={responseTest}>
            {running ? "Recording response…" : "Run actuator response test"}
          </button>{" "}
          {running && <button onClick={restart}>Cancel response test</button>}{" "}
          <button
            disabled={!report?.complete}
            onClick={() => downloadJSON("allegro-response.json", report)}
          >
            Export complete response
          </button>{" "}
          <button
            disabled={!snapshot || running}
            onClick={() =>
              downloadJSON("allegro-snapshot.json", {
                ...snapshot,
                targetsRad: displayedTargets,
                source: manifest.source,
              })
            }
          >
            Export robot snapshot
          </button>
        </div>
        {report && (
          <div role="status">
            <strong>Response recorded · {report.protocol.joint}</strong>
            <p>
              Final error{" "}
              {((report.metrics.finalErrorRad * 180) / Math.PI).toFixed(2)}°
            </p>
            <p>
              Last 0.5 s RMSE{" "}
              {((report.metrics.tailRmseRad * 180) / Math.PI).toFixed(2)}°
            </p>
            <p>
              {report.metrics.saturationSamples} torque-saturated response
              samples
            </p>
            <p className="robot-footnote">
              Synthetic response evidence. No hardware calibration claim.
            </p>
          </div>
        )}
      </section>
      <footer className="robot-source">
        <a href={`${root}manifest.json`} download>
          Download model manifest
        </a>
        <a href={`${root}LICENSE`}>BSD license & attribution</a>
        <a href="https://github.com/Deadialine/coachsim/blob/codex/allegro-model/docs/ALLEGRO_MODEL.md">
          Model assumptions & verification ↗
        </a>
      </footer>
    </section>
  );
}
