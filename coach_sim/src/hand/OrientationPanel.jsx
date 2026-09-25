import React, { useEffect, useRef, useState } from "react";
import {
  fromEuler,
  PLACEMENTS,
  IDENTITY,
  multiply,
  inverse,
  normalize,
} from "./frames.mjs";
import {
  importIMU,
  estimate,
  demoSamples,
  createFilter,
  lineDecoder,
  FILTER_VERSION,
} from "./imu.mjs";
export function downloadJSON(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function OrientationPanel({
  active,
  setup,
  onSetup,
  onObservation,
  diagnostics,
  controls,
}) {
  const [angles, setAngles] = useState(PLACEMENTS.upright),
    [record, setRecord] = useState(null),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [live, setLive] = useState(false),
    [mount, setMount] = useState(IDENTITY);
  const serial = useRef(null),
    mounted = useRef(true),
    activeRef = useRef(active);
  activeRef.current = active;
  async function stopLive() {
    const s = serial.current;
    if (s) {
      s.stopped = true;
      await s.reader?.cancel().catch(() => {});
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopLive();
    };
  }, []);
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      stopLive();
    }
  }, [active]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        setPlaying(false);
        stopLive();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    if (!playing || !active || !record || live) return;
    const start = performance.now(),
      t0 = record.estimates[index].t_us;
    let frame;
    function tick(now) {
      let next = index;
      const time = t0 + (now - start) * 1000;
      while (
        next + 1 < record.estimates.length &&
        record.estimates[next + 1].t_us <= time
      )
        next++;
      setIndex(next);
      if (next + 1 === record.estimates.length) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active, record, live]);
  const current = record?.estimates[index];
  useEffect(() => {
    if (record)
      onObservation({
        q: !error && current?.q ? normalize(multiply(current.q, mount)) : null,
        quality: error ? "Input stopped" : (current?.quality ?? "waiting"),
      });
  }, [record, current, mount, error]);
  function load(samples, provenance) {
    try {
      if (!samples.length)
        throw Error("No usable samples. Import a valid CSV recording.");
      const estimates = estimate(samples);
      if (!estimates.some((e) => e.q))
        throw Error(
          "Recording needs at least one full stationary second for calibration.",
        );
      setRecord({ samples, estimates, provenance });
      setIndex(estimates.findIndex((e) => e.q));
      setMount(IDENTITY);
      setPlaying(false);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function connect() {
    if (live) return;
    setLive(true);
    setError("");
    setPlaying(false);
    let port, reader, watchdog;
    const samples = [],
      estimates = [];
    let opened = false;
    try {
      if (!navigator.serial)
        throw Error(
          "Web Serial is unavailable. Use a compatible desktop browser or import a CSV.",
        );
      port = await navigator.serial.requestPort();
      if (!mounted.current || !activeRef.current || document.hidden) return;
      await port.open({ baudRate: 115200 });
      opened = true;
      if (!mounted.current || !activeRef.current || document.hidden) return;
      reader = port.readable.getReader();
      const state = { reader, stopped: false, lastSampleAt: performance.now() };
      serial.current = state;
      watchdog = setInterval(() => {
        if (!state.stopped && performance.now() - state.lastSampleAt > 1000) {
          if (mounted.current)
            setError(
              "No valid live samples for one second. Reconnect and recalibrate.",
            );
          stopLive();
        }
      }, 250);
      const filter = createFilter(),
        decoder = new TextDecoder();
      setLive(true);
      setMount(IDENTITY);
      setRecord({
        samples: [],
        estimates: [],
        provenance: "live serial · hardware unverified",
      });
      const consume = lineDecoder((s) => {
        if (samples.length >= 60000)
          throw Error("60,000-sample recording limit reached.");
        const estimated = filter.push(s);
        state.lastSampleAt = performance.now();
        samples.push(s);
        estimates.push(estimated);
      });
      let report = 0;
      while (!state.stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        consume(decoder.decode(value, { stream: true }));
        if (performance.now() - report > 50) {
          setRecord({
            samples: [...samples],
            estimates: [...estimates],
            provenance: "live serial · hardware unverified",
          });
          setIndex(Math.max(0, estimates.length - 1));
          report = performance.now();
        }
      }
      if (mounted.current) {
        setRecord({
          samples: [...samples],
          estimates: [...estimates],
          provenance: "live serial · hardware unverified",
        });
        setIndex(Math.max(0, estimates.length - 1));
      }
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      clearInterval(watchdog);
      reader?.releaseLock();
      if (opened) await port?.close().catch(() => {});
      serial.current = null;
      if (mounted.current) {
        setLive(false);
        if (samples.length) {
          setRecord({
            samples,
            estimates,
            provenance: "live serial · hardware unverified",
          });
          setIndex(Math.max(0, estimates.length - 1));
        }
      }
    }
  }
  function manual() {
    stopLive();
    setRecord(null);
    setPlaying(false);
    setError("");
    onObservation(null);
    onSetup({ ...setup, baseOrientation: fromEuler(angles) });
  }
  return (
    <section className="orientation-panel" aria-label="Orientation laboratory">
      <div className="section-title">
        <div>
          <p className="eyebrow">ORIENTATION LAB / WORLD & SENSOR FRAMES</p>
          <h2>Explore every direction.</h2>
        </div>
        <span>{record ? "IMU observation" : "Manual physics"}</span>
      </div>
      <p>
        Gravity points down in the room. Forearm placement and anatomical joint
        angles are separate. IMU observation holds articulation fixed and
        rotates about the palm; position and finger motion are unmeasured.
      </p>
      <div className="orientation-grid">
        <div>
          <h3>Place the forearm</h3>
          <div className="grip-buttons">
            {Object.entries(PLACEMENTS).map(([key, value]) => (
              <button
                key={key}
                disabled={live}
                onClick={() => setAngles(value)}
              >
                {key.replaceAll("_", " ")}
              </button>
            ))}
          </div>
          {["roll", "pitch", "yaw"].map((k) => (
            <label className="joint-control" key={k}>
              <span>
                {k}
                <output>{angles[k]}°</output>
              </span>
              <input
                aria-label={`Placement ${k}`}
                type="range"
                min="-180"
                max="180"
                value={angles[k]}
                onChange={(e) =>
                  setAngles({ ...angles, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <button onClick={manual} disabled={live}>
            Apply placement · restart physics
          </button>
          <p className="help">
            Local-to-world rotation: Z yaw × Y pitch × X roll. Applying starts a
            fresh physical trial. Orbiting the camera only changes your view.
          </p>
          <button
            onClick={() =>
              downloadJSON("coachsim-setup.json", {
                schema: "coachsim-orientation-1",
                mode: record ? "observation" : "physics",
                setup,
                controls,
                diagnosticSnapshot: diagnostics,
                note: "Setup reproduces initial conditions, not a saved dynamic continuation. Engineering model; no participant validation.",
              })
            }
          >
            Export setup & snapshot
          </button>
        </div>
        <div>
          <h3>Follow an IMU</h3>
          <p className="help">
            CSV: t_us, ax, ay, az, gx, gy, gz. Units: microseconds, g,
            degrees/second. Begin with at least one stationary second. Six-axis
            heading is relative and can drift.
          </p>
          <div className="grip-buttons">
            <button
              disabled={live}
              onClick={() => load(demoSamples(), "synthetic demonstration")}
            >
              Load synthetic demo
            </button>
            <label className="imu-file">
              Import IMU CSV
              <input
                aria-label="Import IMU CSV"
                type="file"
                accept=".csv,text/csv"
                disabled={live}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    if (file.size > 10_000_000)
                      setError("Recording exceeds 10 MB.");
                    else
                      load(
                        importSafe(await file.text()),
                        "imported recording · unverified",
                      );
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <button disabled={live} onClick={connect}>
              Connect live IMU
            </button>
            {live && <button onClick={stopLive}>Disconnect</button>}
          </div>
          <p className="help">
            Live input: 115200 baud, one JSON object per line with the same
            seven fields. Read-only connection; acquisition firmware must supply
            the samples.
          </p>
          {record && (
            <>
              <p className="imu-status" role="status">
                {record.provenance}
                <br />
                {error
                  ? "Stopped · " + error
                  : (current?.quality ?? "Waiting for samples")}
              </p>
              <p className="help">
                Sensor mounting:{" "}
                {mount === IDENTITY
                  ? "identity assumption"
                  : "aligned to displayed manual reference"}
                . Forearm and fingers remain illustrative.
              </p>
              <div className="grip-buttons">
                <button
                  disabled={live || !record.estimates.length}
                  onClick={() => {
                    if (index >= record.estimates.length - 1) setIndex(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "Pause recording" : "Play recording"}
                </button>
                <button
                  disabled={!current?.q}
                  onClick={() =>
                    setMount(
                      normalize(
                        multiply(inverse(current.q), setup.baseOrientation),
                      ),
                    )
                  }
                >
                  Align sample to setup orientation
                </button>
              </div>
              <label className="joint-control">
                <span>
                  Recording time
                  <output>
                    {(
                      (current?.t_us - (record.estimates[0]?.t_us ?? 0)) /
                        1e6 || 0
                    ).toFixed(2)}{" "}
                    s
                  </output>
                </span>
                <input
                  type="range"
                  aria-label="Recording time"
                  min="0"
                  max={Math.max(0, record.estimates.length - 1)}
                  value={index}
                  disabled={live}
                  onChange={(e) => {
                    setPlaying(false);
                    setIndex(Number(e.target.value));
                  }}
                />
              </label>
              <button
                onClick={() =>
                  downloadJSON("coachsim-imu-orientation.json", {
                    schema: "coachsim-imu-orientation-1",
                    filter: FILTER_VERSION,
                    inputStatus:
                      error || (live ? "acquiring" : "stopped or imported"),
                    units: { time: "µs", acceleration: "g", gyro: "deg/s" },
                    sensorToHand: mount,
                    heading: "relative, drift uncorrected",
                    position: "not measured",
                    ...record,
                  })
                }
              >
                Export samples & orientation
              </button>
            </>
          )}
          {error && !record && <p role="alert">{error}</p>}
        </div>
      </div>
      <p className="help">
        Observation suspends forces and contacts. A single hand-mounted IMU
        cannot separate wrist motion from forearm motion. Use manual physics to
        study those joints independently. This orientation recording is separate
        from the experiment session and does not feed the coaching classifier or
        replace its signal logs.
      </p>
    </section>
  );
}
