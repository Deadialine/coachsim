import React, { useState } from "react";
import HandViewport from "./HandViewport";
import { DEFAULT_CONTROLS, PRESETS } from "./controls.mjs";
import "./hand.css";

export default function ExperimentHand({ target, prediction, stable }) {
  const [source, setSource] = useState("target");
  const posture = source === "target" ? target : stable ? prediction : null;
  const valid = Object.hasOwn(PRESETS, posture ?? "");
  const controls = {
    ...DEFAULT_CONTROLS,
    ...(valid ? PRESETS[posture] : PRESETS.neutral_rest),
  };
  return (
    <section className="panel experiment-hand">
      <div className="section-title">
        <h2>3D posture illustration</h2>
        <label>
          Follow{" "}
          <select
            aria-label="3D posture source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="target">Target cue</option>
            <option value="prediction">Stable prediction</option>
          </select>
        </label>
      </div>
      <p>
        {valid
          ? posture.replaceAll("_", " ")
          : "No reliable posture — neutral illustration"}{" "}
        · {source === "target" ? "planned cue" : "quality-gated prediction"}
      </p>
      <HandViewport
        controls={controls}
        appearance={{ shell: true, sensors: true, labels: false }}
        paused={false}
        reset={0}
        cameraView="dorsal"
      />
      <p className="muted">
        Illustrative motor targets, not reconstructed motion. The hand settles
        using its own physics clock when a cue or replay cursor changes.
        Uncertain predictions show a labeled neutral illustration. No joint
        angles are added to the recorded session bundle.
      </p>
    </section>
  );
}
