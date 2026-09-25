import React, { useState } from "react";
import HandViewport from "./hand/HandViewport";
import { DEFAULT_CONTROLS, PRESETS, DIGITS } from "./hand/controls.mjs";
import "./hand/hand.css";
import OrientationPanel from "./hand/OrientationPanel";
import { IDENTITY } from "./hand/frames.mjs";

const title = (s) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function Slider({
  name,
  value,
  min,
  max,
  step = 1,
  unit = "°",
  onChange,
  note,
}) {
  return (
    <label className="joint-control">
      <span>
        {name}
        <output>
          {unit === "%" ? Math.round(value * 100) : value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {note && <small>{note}</small>}
    </label>
  );
}
export default function App({ active = true, sensorLayout }) {
  const [controls, setControls] = useState({ ...DEFAULT_CONTROLS }),
    [appearance, setAppearance] = useState({
      shell: true,
      labels: true,
      sensors: true,
      tendons: false,
      opacity: 0.24,
      axes: false,
      colliders: false,
    });
  const [paused, setPaused] = useState(false),
    [reset, setReset] = useState(0),
    [ballRequest, setBallRequest] = useState(0),
    [cameraView, setCameraView] = useState("detail"),
    [cameraVersion, setCameraVersion] = useState(0),
    [diagnostics, setDiagnostics] = useState(null),
    [preset, setPreset] = useState("neutral_rest");
  const [setup, setSetup] = useState({
    basePosition: { x: 0, y: 0, z: 0 },
    baseOrientation: IDENTITY,
    floorY: -0.6,
  });
  const [observation, setObservation] = useState(null);
  const applySetup = (value) => {
    setSetup(value);
    setObservation(null);
    setDiagnostics(null);
    setReset((n) => n + 1);
  };
  const set = (key, value) => {
    setControls((c) => ({ ...c, [key]: value }));
    setPreset("manual");
  };
  const applyPreset = (key) => {
    setControls((c) => ({
      ...c,
      ...PRESETS[key],
      motors: true,
      index: 0,
      middle: 0,
      ring: 0,
      little: 0,
      thumb: 0,
      opposition: 0,
      spread: 0,
      cup: 0,
    }));
    setPreset(key);
  };
  function resetAll() {
    setControls({ ...DEFAULT_CONTROLS });
    setPreset("neutral_rest");
    setPaused(false);
    setCameraView("detail");
    setDiagnostics(null);
    setReset((n) => n + 1);
  }
  return (
    <section className="hand-app" aria-label="Hand mechanics lab">
      <header className="hand-header">
        <a className="wordmark" href="?">
          COACH<span>SIM</span>
          <small>RESEARCH WORKSPACE</small>
        </a>
        <nav aria-label="Workspace">
          <a href="?">Experiment</a>
          <a href="?view=hand" aria-current="page">
            Hand mechanics
          </a>
          <a
            href="https://github.com/Deadialine/coachsim"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <span className="simulation-badge">SIMULATION · NO HARDWARE</span>
      </header>
      <section className="hand-intro">
        <div>
          <p className="eyebrow">BIOMECHANICS LAB / 01</p>
          <h1>Explore movement. See the mechanics.</h1>
          <p>
            Explore the right hand, from forearm rotation to individual finger
            joints. Motor targets drive a rigid-body physics simulation with
            gravity, joint limits, and object contact.
          </p>
        </div>
        <aside>
          <strong>4 × sEMG + 1 × IMU</strong>
          <span>Current study configuration</span>
          <p>
            Hand motion here is illustrative. It is not reconstructed from EMG
            and does not represent a validated participant model.
          </p>
        </aside>
      </section>
      <section className="hand-workspace" aria-label="Hand mechanics controls">
        <div className="stage-column">
          <div className="stage">
            <div className="stage-top">
              <span>
                <i /> RIGHT HAND /{" "}
                {observation ? "OBSERVED ORIENTATION" : "LIVE PHYSICS"}
              </span>
              <span>
                {observation
                  ? observation.quality
                  : paused
                    ? "PAUSED"
                    : "120 Hz fixed step"}
              </span>
            </div>
            <HandViewport
              setup={setup}
              observation={observation}
              controls={controls}
              appearance={{ ...appearance, layout: sensorLayout }}
              paused={paused || !active}
              active={active}
              reset={reset}
              ballRequest={ballRequest}
              cameraView={cameraView}
              cameraVersion={cameraVersion}
              onDiagnostics={setDiagnostics}
            />
            <div className="stage-bottom">
              <span>Drag to orbit · Scroll to zoom · Right-drag to pan</span>
              <div>
                {["detail", "dorsal", "palmar", "side"].map((view) => (
                  <button
                    key={view}
                    className={cameraView === view ? "selected" : ""}
                    onClick={() => {
                      setCameraView(view);
                      setCameraVersion((v) => v + 1);
                    }}
                  >
                    {view === "detail" ? "Hand detail" : title(view)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <OrientationPanel
            active={active}
            setup={setup}
            onSetup={applySetup}
            onObservation={setObservation}
            diagnostics={diagnostics}
            controls={controls}
          />
          <div className="physics-strip" hidden={!!observation}>
            <div>
              <span>Joint connections</span>
              <strong>
                {diagnostics?.separationMm.toFixed(3) ?? "—"}{" "}
                <small>mm max error</small>
              </strong>
            </div>
            <div>
              <span>Limit overshoot</span>
              <strong>
                {diagnostics?.limitErrorDeg.toFixed(2) ?? "—"}
                <small>°</small>
              </strong>
            </div>
            <div>
              <span>Object contacts</span>
              <strong>
                {diagnostics?.contacts ?? "—"} <small>active pairs</small>
              </strong>
            </div>
            <div>
              <span>Physics time</span>
              <strong>
                {diagnostics ? (diagnostics.steps / 120).toFixed(1) : "0.0"}{" "}
                <small>s</small>
              </strong>
            </div>
          </div>
          <section
            hidden={!!observation}
            className="motion-feedback"
            aria-label="Live movement feedback"
          >
            <div className="section-title">
              <h2>Movement response</h2>
              <span>Target / actual · degrees</span>
            </div>
            <div className="angle-cards">
              {[
                ["flex", "Wrist bend"],
                ["deviation", "Wrist deviation"],
                ["rotation", "Forearm rotation"],
                ["index_PIP", "Index PIP"],
              ].map(([key, name]) => (
                <div key={key}>
                  <span>{name}</span>
                  <strong>
                    {diagnostics?.angles[key]?.toFixed(1) ?? "—"}°
                  </strong>
                  <small>
                    Target {diagnostics?.targets[key]?.toFixed(1) ?? "0.0"}°
                  </small>
                </div>
              ))}
            </div>
            <p>
              Actual angles respond to inertia, gravity, and contact. Targets
              are commands, not measurements.
            </p>
          </section>
          <div className="view-options">
            <button
              onClick={() =>
                setAppearance((a) => ({
                  ...a,
                  shell: true,
                  opacity: 0.24,
                  labels: true,
                  tendons: false,
                }))
              }
            >
              Anatomy view
            </button>
            <button
              onClick={() =>
                setAppearance((a) => ({
                  ...a,
                  shell: true,
                  opacity: 1,
                  labels: false,
                  tendons: false,
                }))
              }
            >
              Surface view
            </button>
            <button
              onClick={() =>
                setAppearance((a) => ({
                  ...a,
                  shell: false,
                  labels: true,
                  tendons: true,
                }))
              }
            >
              Tendon guide view
            </button>
            <strong>Show</strong>
            {[
              ["shell", "Surface"],
              ["labels", "Labels"],
              ["sensors", "Sensor sites"],
              ["tendons", "Tendon paths"],
              ["axes", "World axes"],
              ["colliders", "Contact shapes"],
            ].map(([key, name]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={appearance[key]}
                  onChange={(e) =>
                    setAppearance((a) => ({ ...a, [key]: e.target.checked }))
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <p className="caption">
            Bone-colored links show connections; amber points mark joints.
            Sensor sites and tendon paths are schematic. The tendons shown are
            visual guides, not force-generating tissues. Contact shapes show the
            solver's simplified collision geometry at its latest step; they are
            hidden during IMU observation.
          </p>
          <section className="motion-feedback">
            <div className="section-title">
              <h2>Follow the connections</h2>
              <label>
                Trace a digit{" "}
                <select
                  value={appearance.focus ?? ""}
                  onChange={(e) =>
                    setAppearance((a) => ({ ...a, focus: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {[...DIGITS, "thumb"].map((d) => (
                    <option value={d} key={d}>
                      {title(d)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              The mint line follows the selected physical chain from forearm to
              fingertip. Ring and little fingers pass through moving CMC joints;
              index and middle metacarpals stay with the palm core. The thumb
              has its own two-axis base.
            </p>
            <p>
              Surface view follows the bones for visual continuity. Contact uses
              simplified rigid colliders; the surface is not simulated soft
              tissue.
            </p>
          </section>
          <section className="scope-card">
            <p className="eyebrow">ACQUISITION PLAN</p>
            <h2>Designed around the current study.</h2>
            <div className="sensor-grid">
              <article>
                <span className="sensor-number">01—04</span>
                <h3>Forearm sEMG</h3>
                <p>
                  Four bipolar MyoWare RAW channels. Target sampling: 2,000 Hz
                  per channel. The displayed sites are schematic, pending the
                  placement protocol and hardware verification.
                </p>
              </article>
              <article>
                <span className="sensor-number amber">05</span>
                <h3>Dorsal hand IMU</h3>
                <p>
                  One MPU6050: 3-axis acceleration and angular velocity at a
                  target 100 Hz. Its orientation is relative to the hand; no
                  magnetometer or absolute heading is assumed.
                </p>
              </article>
            </div>
            <p className="scope-foot">
              ESP32 acquisition is planned. DS1307 supplies wall-clock metadata
              only; sample timing uses a monotonic clock. Synthetic trials are
              labeled; imported and live IMU data require hardware verification.
            </p>
          </section>
        </div>
        <aside className="control-column">
          {observation && (
            <p className="imu-status">
              Articulation is held during observation. Apply a placement to
              resume physics.
            </p>
          )}
          <fieldset disabled={!!observation} className="articulation-fieldset">
            <section className="control-card">
              <p className="eyebrow">01 / STUDY POSTURES</p>
              <h2>Seven movement states</h2>
              <div className="preset-grid">
                {Object.keys(PRESETS).map((key) => (
                  <button
                    key={key}
                    className={preset === key ? "active" : ""}
                    onClick={() => applyPreset(key)}
                  >
                    {title(key)}
                  </button>
                ))}
              </div>
              <p className="help">
                These are illustrative targets for the seven study classes, not
                measured angles or classifier output.
              </p>
            </section>
            <section className="control-card">
              <p className="eyebrow">02 / ARTICULATION</p>
              <h2>Wrist & forearm</h2>
              <Slider
                name="Wrist flexion / extension"
                value={controls.flex}
                min={-70}
                max={70}
                onChange={(v) => set("flex", v)}
                note="Negative: extension · Positive: flexion"
              />
              <Slider
                name="Radial / ulnar deviation"
                value={controls.deviation}
                min={-35}
                max={20}
                onChange={(v) => set("deviation", v)}
                note="Negative: ulnar · Positive: radial"
              />
              <Slider
                name="Forearm supination / pronation"
                value={controls.rotation}
                min={-80}
                max={80}
                onChange={(v) => set("rotation", v)}
                note="Negative: pronation · Positive: supination"
              />
              <h3>Finger articulation</h3>
              <div className="grip-buttons">
                <button
                  onClick={() => {
                    setControls((c) => ({
                      ...c,
                      index: 0,
                      middle: 0,
                      ring: 0,
                      little: 0,
                      thumb: 0,
                      opposition: 0,
                      spread: 0,
                      cup: 0,
                    }));
                    setPreset("manual");
                  }}
                >
                  Open hand
                </button>
                <button
                  onClick={() => {
                    setControls((c) => ({
                      ...c,
                      index: 0.9,
                      middle: 0.9,
                      ring: 0.9,
                      little: 0.9,
                      thumb: 0.7,
                      opposition: 55,
                      spread: 0,
                      motors: true,
                      cup: 0.8,
                    }));
                    setPreset("manual");
                  }}
                >
                  Power curl
                </button>
                <button
                  onClick={() => {
                    setControls((c) => ({
                      ...c,
                      index: 0.55,
                      middle: 0.6,
                      ring: 0.65,
                      little: 0.7,
                      thumb: 0.4,
                      opposition: 45,
                      cup: 1,
                      spread: 0,
                      motors: true,
                    }));
                    setPreset("manual");
                  }}
                >
                  Cupped grasp
                </button>
              </div>
              <Slider
                name="Palm cupping"
                value={controls.cup}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                onChange={(v) => set("cup", v)}
                note="Moves the ring and little metacarpals at their CMC joints."
              />
              {[...DIGITS, "thumb"].map((name) => (
                <Slider
                  key={name}
                  name={`${title(name)} curl`}
                  value={controls[name]}
                  min={0}
                  max={1}
                  step={0.01}
                  unit="%"
                  onChange={(v) => set(name, v)}
                />
              ))}
              <Slider
                name="Thumb opposition"
                value={controls.opposition}
                min={0}
                max={65}
                onChange={(v) => set("opposition", v)}
              />
              <Slider
                name="Finger spread"
                value={controls.spread}
                min={0}
                max={20}
                onChange={(v) => set("spread", v)}
              />
              <p className="help">
                Curl coordinates MCP, PIP, and DIP targets. Spread decreases as
                fingers curl. The thumb has its own CMC, MCP, and IP chain.
              </p>
            </section>
            <section className="control-card">
              <p className="eyebrow">03 / PHYSICS BENCH</p>
              <h2>Forces & contact</h2>
              <Slider
                name="Wrist–finger coupling"
                value={controls.coupling}
                min={0}
                max={1}
                step={0.1}
                unit="%"
                onChange={(v) => set("coupling", v)}
              />
              <p className="help">
                Optional tenodesis illustration: wrist extension increases the
                resting finger curl; flexion opens it. 0% keeps independent
                controls. This motor-target approximation is not passive tendon
                mechanics or a fitted human model.
              </p>
              <label className="toggle-row">
                <span>Gravity · 9.81 m/s²</span>
                <input
                  type="checkbox"
                  checked={controls.gravity}
                  onChange={(e) => set("gravity", e.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Joint motors</span>
                <input
                  type="checkbox"
                  checked={controls.motors}
                  onChange={(e) => set("motors", e.target.checked)}
                />
              </label>
              <Slider
                name="Motor stiffness scale"
                value={controls.strength}
                min={0.5}
                max={8}
                step={0.5}
                unit="×"
                onChange={(v) => set("strength", v)}
              />
              <div className="grip-buttons">
                <button onClick={() => setBallRequest((n) => n + 1)}>
                  Place contact ball
                </button>
                <button onClick={() => setPaused((p) => !p)}>
                  {paused ? "Resume physics" : "Pause physics"}
                </button>
                <button onClick={resetAll}>Reset model</button>
              </div>
              <p className="help">
                A 60 g ball responds to gravity and collides with the hand and
                floor. Switch to the palmar view to see contact. Motors off
                releases the joints; the forearm support stays fixed.
              </p>
            </section>
          </fieldset>
        </aside>
      </section>
      <section className="model-notes">
        <div>
          <p className="eyebrow">MODEL BOUNDARIES</p>
          <h2>
            Real dynamics.
            <br />
            Explicit simplifications.
          </h2>
        </div>
        <div>
          <p>
            25 constrained rotation axes connect rigid segments. The solver
            applies motor torques, inertial response, gravity, friction, object
            contact, and finger self-contact at 120 steps per simulated second.
            Target and actual angles can differ under load.
          </p>
          <p>
            Serial hinges approximate the wrist and thumb saddle joint. The
            carpal bones and index/middle metacarpals form the stable palm core.
            Ring and little metacarpals articulate to cup the palm. Radius
            rotation is schematic; radioulnar translation, ligament forces,
            tendon routing mechanics, and soft-tissue deformation are not
            modeled. Nonadjacent hand segments do collide. Link sizes, masses,
            and motor gains are engineering assumptions.
          </p>
          <p>
            The research scope is wrist/forearm classification with LDA as the
            primary model and RBF SVM as a comparison, evaluated across
            sessions. Finger tracking, strain/FSR, respiration, PPG, haptics,
            and lower-limb sensing are outside this study.
          </p>
          <a
            href="https://github.com/Deadialine/coachsim/blob/main/docs/HAND_MODEL.md"
            target="_blank"
            rel="noreferrer"
          >
            Read model assumptions & validation ↗
          </a>
        </div>
      </section>
      <details className="joint-readout" hidden={!!observation}>
        <summary>Inspect all 25 joints · target, command & actual</summary>
        <table>
          <thead>
            <tr>
              <th>Joint</th>
              <th>Target</th>
              <th>Smoothed command</th>
              <th>Actual angle</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(diagnostics?.angles ?? {}).map(([key, value]) => (
              <tr key={key}>
                <td>{title(key)}</td>
                <td>{diagnostics.targets[key].toFixed(1)}°</td>
                <td>{diagnostics.commands[key].toFixed(1)}°</td>
                <td>{value.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Maximum target error: {diagnostics?.trackingDeg.toFixed(2) ?? "—"}°.
          Background-tab time discarded:{" "}
          {diagnostics?.discarded.toFixed(2) ?? "0"} s. This interactive physics
          clock is separate from experiment timestamps.
        </p>
      </details>
      <footer className="hand-footer">
        <span>COACHSIM / SPARSE EMG–IMU RESEARCH</span>
        <a href="?">Return to experiment workflow →</a>
      </footer>
    </section>
  );
}
