import React, { useEffect, useRef, useState } from "react";
import { initPhysics, ROBOT_DT } from "./physics.mjs";
import { createManipulation, PROTOCOL } from "./manipulation.mjs";
import { createRobotScene } from "./scene.mjs";
import { downloadJSON } from "../hand/OrientationPanel";
import "./robot.css";
const root = `${import.meta.env.BASE_URL}models/allegro/`;
export default function ManipulationLab({ active = true }) {
  const [manifest, setManifest] = useState(null),
    [seed, setSeed] = useState(1),
    [controller, setController] = useState("fixed-close-v1"),
    [version, setVersion] = useState(0),
    [running, setRunning] = useState(false),
    [ready, setReady] = useState(false),
    [state, setState] = useState(null),
    [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [colliders, setColliders] = useState(false);
  const host = useRef(),
    current = useRef(),
    episode = useRef();
  current.current = { active, running, colliders };
  useEffect(() => {
    const a = new AbortController();
    fetch(`${root}manifest.json`, { signal: a.signal })
      .then((r) => {
        if (!r.ok) throw Error("Cannot load robot model");
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => a.abort();
  }, []);
  useEffect(() => {
    if (!manifest) return;
    const abort = new AbortController();
    let cancelled = false,
      frame,
      env,
      scene;
    setReady(false);
    setError("");
    setState(null);
    setReport(null);
    (async () => {
      try {
        await initPhysics();
        if (cancelled) return;
        env = createManipulation(manifest, { seed, controller });
        episode.current = env;
        scene = await createRobotScene(
          host.current,
          env.model,
          root,
          abort.signal,
        );
        if (cancelled) {
          scene.dispose();
          env.dispose();
          return;
        }
        setReady(true);
        let last = performance.now(),
          acc = 0,
          update = 0;
        function tick(now) {
          if (cancelled) return;
          try {
            const c = current.current,
              dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
            last = now;
            if (c.active && !document.hidden) {
              if (c.running && !env.complete) {
                acc += dt;
                while (acc >= ROBOT_DT && !env.complete) {
                  env.advance();
                  acc -= ROBOT_DT;
                }
                if (env.complete) {
                  setState(env.state);
                  setReport(env.report());
                  setRunning(false);
                }
              } else acc = 0;
              scene.draw({ colliders: c.colliders });
              if (now - update > 150) {
                setState(env.state);
                update = now;
              }
            } else acc = 0;
            frame = requestAnimationFrame(tick);
          } catch (e) {
            setError(e.message);
            setRunning(false);
          }
        }
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setRunning(false);
        }
        env?.dispose();
        env = null;
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      cancelAnimationFrame(frame);
      if (scene) {
        scene.dispose();
        env?.dispose();
      }
      episode.current = null;
    };
  }, [manifest, version, seed, controller]);
  const fingers = [
    ...new Set(
      (state?.contacts ?? [])
        .filter(
          (c) =>
            c.normalImpulseNs > 1e-9 &&
            ["ff", "mf", "rf", "th"].includes(c.digit),
        )
        .map((c) => c.digit),
    ),
  ];
  function run() {
    setRunning(true);
    setVersion((v) => v + 1);
  }
  function cancel() {
    setRunning(false);
    setReport({
      ...episode.current.report(),
      complete: false,
      outcome: "cancelled",
    });
  }
  return (
    <section className="robot-lab" aria-label="Manipulation laboratory">
      <header className="robot-heading">
        <div>
          <p className="eyebrow">MANIPULATION / MILESTONE 03</p>
          <h1>
            Release. Disturb.
            <br />
            Measure what holds.
          </h1>
          <p>
            Allegro V3 · seeded grasp-retention trials · ideal contact
            observations
          </p>
        </div>
        <span className="robot-status">
          {error
            ? "UNAVAILABLE"
            : running
              ? "TRIAL RUNNING"
              : ready
                ? "READY"
                : "LOADING"}
        </span>
      </header>
      <p className="robot-boundary">
        A positioning fixture holds the sphere for 1 s while the hand closes. It
        then releases completely under gravity. A small lateral impulse follows
        at 2 s. Success requires a continuous final second of stable contact
        from two distinct fingers. No floor or invisible support is present
        after release.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="robot-layout">
        <div className="robot-stage">
          <div className="robot-canvas" ref={host} />
          <div className="robot-caption">
            <span>Amber sphere · 30 g · 25 mm radius</span>
            <span>Drag to orbit · scroll to zoom</span>
          </div>
          <div className="robot-metrics">
            <span>
              <b>{(state?.timeSeconds ?? 0).toFixed(2)} s</b>simulation time
            </span>
            <span>
              <b>{fingers.length}</b>contacting fingers
            </span>
            <span>
              <b>{((state?.heldSteps ?? 0) / 240).toFixed(2)} s</b>consecutive
              eligible hold
            </span>
          </div>
          <p className="robot-footnote">
            {state?.phase === "fixture-supported" || !state
              ? "Fixture supported — cannot count as a successful grasp."
              : "Released object — only solver contacts can support it."}{" "}
            Reference grid has no collider.
          </p>
        </div>
        <aside className="robot-controls">
          <p className="eyebrow">FROZEN TASK / SPHERE RETENTION V1</p>
          <h2>Test the grasp, not the pose.</h2>
          <fieldset disabled={running}>
            <label>
              Placement seed
              <input
                aria-label="Manipulation seed"
                type="number"
                min="0"
                max="4294967295"
                step="1"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
            </label>
            <label>
              Reference controller
              <select
                aria-label="Manipulation controller"
                value={controller}
                onChange={(e) => setController(e.target.value)}
              >
                <option value="fixed-close-v1">Fixed closing command</option>
                <option value="open-hand-v1">
                  Open hand · negative control
                </option>
              </select>
            </label>
          </fieldset>
          <p className="robot-footnote">
            Seeds 1–10 are for development. The published held-out comparison
            uses 1000–1099. Both controllers are untrained baselines; a closing
            pose is not evidence of a successful grasp.
          </p>
          <div className="robot-buttons">
            <button disabled={!ready || running || !!error} onClick={run}>
              Run retention trial
            </button>
            {running && <button onClick={cancel}>Cancel trial</button>}
          </div>
          <label className="robot-check">
            <input
              type="checkbox"
              checked={colliders}
              onChange={(e) => setColliders(e.target.checked)}
            />
            Show collision geometry
          </label>
          <div className="robot-readouts">
            <span>
              Object displacement
              <strong>
                {((state?.object.displacementM ?? 0) * 1000).toFixed(1)} mm
              </strong>
            </span>
            <span>
              Object speed
              <strong>{(state?.object.speedMS ?? 0).toFixed(3)} m/s</strong>
            </span>
            <span>
              Object / hand normal load
              <strong>
                {(
                  state?.contacts.reduce((s, c) => s + c.normalLoadN, 0) ?? 0
                ).toFixed(3)}{" "}
                N
              </strong>
            </span>
            <span>
              Phase<strong>{state?.phase ?? "Ready"}</strong>
            </span>
          </div>
          <p className="robot-footnote">
            Loads are timestep-average normal-impulse estimates, summed as
            magnitudes. They are not calibrated tactile forces or a
            force-closure score.
          </p>
          <h3>Contact evidence</h3>
          {state?.contacts.length ? (
            <ul>
              {state.contacts.map((c, i) => (
                <li key={i}>
                  {c.body}: {c.normalLoadN.toFixed(3)} N
                </li>
              ))}
            </ul>
          ) : (
            <p>No active object contacts.</p>
          )}
          <div role="status">
            <strong>
              {report ? `Outcome: ${report.outcome}` : "No completed trial yet"}
            </strong>
            {report && (
              <p>
                {report.complete
                  ? "Complete episode"
                  : "Incomplete episode — excluded from success statistics"}
              </p>
            )}
          </div>
          <button
            disabled={!report?.complete}
            onClick={() =>
              downloadJSON(`retention-${controller}-${seed}.json`, report)
            }
          >
            Export complete retention trial
          </button>
        </aside>
      </div>
      <section className="robot-response">
        <div>
          <p className="eyebrow">SUCCESS HAS CONDITIONS</p>
          <h2>Two fingers. One uninterrupted second.</h2>
          <p>
            At least two distinct finger chains must exert positive normal
            impulse. During the final second, the released sphere must remain
            within 80 mm of its initial position and below 0.15 m/s. A 100 mm
            fall or 140 mm displacement is a drop. Other unfinished holds time
            out at {PROTOCOL.horizonSteps / 240} s.
          </p>
        </div>
        <div>
          <h3>Reproduce the result</h3>
          <p>
            Exports record the seed, sampled start, controller, drive limits,
            source model version, release/impulse events and full 240 Hz object,
            joint and contact traces.
          </p>
          <a href="https://github.com/Deadialine/coachsim/blob/codex/manipulation-bench/docs/MANIPULATION_BENCH.md">
            Protocol and comparison results ↗
          </a>
        </div>
      </section>
    </section>
  );
}
