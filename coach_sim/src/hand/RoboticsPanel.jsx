import React, { useState } from "react";
import { DEFAULT_OBJECT, objectConfiguration } from "./robotics.mjs";
import { downloadJSON } from "./OrientationPanel";
export default function RoboticsPanel({
  setup,
  onApply,
  catalog,
  controls,
  onControls,
  diagnostics,
  disabled,
  onPlace,
}) {
  const [draft, setDraft] = useState({ ...DEFAULT_OBJECT, ...setup.object }),
    [error, setError] = useState(""),
    [joint, setJoint] = useState("index_PIP");
  const selected = catalog.find((j) => j.id === joint),
    contacts = diagnostics?.objectContacts;
  const override = controls.jointTargets?.[joint];
  return (
    <section
      className="joint-inspector"
      aria-label="Robotics contact laboratory"
    >
      <p className="eyebrow">ROBOTICS / CONTROL & CONTACT</p>
      <h2>Test the interaction.</h2>
      <p>
        Applied sphere:{" "}
        {((setup.object?.mass ?? DEFAULT_OBJECT.mass) * 1000).toFixed(0)} g ·{" "}
        {((setup.object?.radius ?? DEFAULT_OBJECT.radius) * 1000).toFixed(0)} mm
        radius · friction {setup.object?.friction ?? DEFAULT_OBJECT.friction}.
      </p>
      <p>
        Engineering hand · ideal simulator state. These virtual contact readings
        are separate from the thesis acquisition sensors.
      </p>
      <fieldset
        disabled={disabled}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <div className="inspector-metrics">
          {[
            ["radius", "Sphere radius (m)", 0.001],
            ["mass", "Object mass (kg)", 0.01],
            ["friction", "Object friction", 0.05],
          ].map(([key, label, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={draft[key]}
                step={step}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [key]: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          onClick={() => {
            try {
              const object = objectConfiguration(draft);
              onApply({ ...setup, object });
              setError("");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Apply object · restart model
        </button>{" "}
        <button onClick={onPlace}>Place object near palm</button>
        {error && <p role="alert">{error}</p>}
        <label>
          Independent joint{" "}
          <select value={joint} onChange={(e) => setJoint(e.target.value)}>
            {catalog.map((j) => (
              <option key={j.id} value={j.id}>
                {j.id.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={override !== undefined}
            onChange={(e) => {
              const targets = { ...controls.jointTargets };
              if (e.target.checked)
                targets[joint] = Math.max(
                  selected.range[0],
                  Math.min(selected.range[1], diagnostics?.targets[joint] ?? 0),
                );
              else delete targets[joint];
              onControls({ ...controls, jointTargets: targets });
            }}
          />{" "}
          Override this joint’s coordinated command
        </label>
        {override !== undefined && selected && (
          <label>
            Joint target: {override.toFixed(1)}°
            <input
              aria-label="Independent joint target"
              type="range"
              min={selected.range[0]}
              max={selected.range[1]}
              step="1"
              value={override}
              onChange={(e) =>
                onControls({
                  ...controls,
                  jointTargets: {
                    ...controls.jointTargets,
                    [joint]: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        )}
        <button onClick={() => onControls({ ...controls, jointTargets: {} })}>
          Clear all independent targets
        </button>
        <p className="caption">
          {Object.keys(controls.jointTargets ?? {}).length} active overrides.
          Overrides take priority over posture presets and curl controls until
          cleared. Motors and smoothing still apply.
        </p>
      </fieldset>
      <div className="inspector-metrics">
        <div>
          <span>Object → hand normal load</span>
          <strong>
            {disabled
              ? "—"
              : (contacts?.handNormalLoadN ?? 0).toFixed(3) + " N"}
          </strong>
        </div>
        <div>
          <span>Object → environment normal load</span>
          <strong>
            {disabled
              ? "—"
              : (contacts?.environmentNormalLoadN ?? 0).toFixed(3) + " N"}
          </strong>
        </div>
      </div>
      <button
        disabled={disabled || !diagnostics}
        onClick={() =>
          downloadJSON("coachsim-robotics-snapshot.json", {
            schema: "coachsim-robotics-snapshot-1",
            provenance: "ideal simulator state, not acquired sensors",
            solver: "Rapier 0.19.3",
            setup,
            controls,
            diagnostics,
          })
        }
      >
        Export robotics snapshot
      </button>
      {!disabled &&
        contacts?.pairs.map((p, i) => (
          <p key={i}>
            {p.body}: {p.normalLoadN.toFixed(3)} N · {p.pointsWorldM.length}{" "}
            contact points
          </p>
        ))}
      <p className="caption">
        Normal impulse ÷ 1/120 s estimates the last step’s average normal load,
        sampled on screen at 5 Hz. Values sum magnitudes, not a net force
        vector. The resting-weight check has approximately 3% solver bias.
        Impacts may occur between displayed samples. These are not calibrated
        tactile measurements or a grasp-stability score.
      </p>
    </section>
  );
}
