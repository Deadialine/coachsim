import React from "react";
const label = (s) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export default function JointInspector({
  catalog,
  selected,
  onSelect,
  diagnostics,
  observation,
}) {
  const joint = catalog.find((j) => j.id === selected);
  return (
    <section className="joint-inspector" aria-label="Joint anatomy inspector">
      <p className="eyebrow">ANATOMY / SOLVER CONNECTIONS</p>
      <h2>Inspect a moving connection.</h2>
      <label>
        Inspect joint{" "}
        <select
          value={selected ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Choose a joint</option>
          {catalog.map((j) => (
            <option key={j.id} value={j.id}>
              {label(j.id)}
            </option>
          ))}
        </select>
      </label>
      {joint ? (
        <>
          <p className="joint-chain">
            {label(joint.parent)} <span aria-hidden="true">→</span>{" "}
            {label(joint.id)}
          </p>
          <div className="inspector-metrics">
            <div>
              <span>Allowed model range</span>
              <strong>
                {joint.range[0]}° to {joint.range[1]}°
              </strong>
            </div>
            <div>
              <span>Actual solved angle</span>
              <strong>
                {observation
                  ? "Held articulation"
                  : `${diagnostics?.angles[joint.id]?.toFixed(1) ?? "—"}°`}
              </strong>
            </div>
          </div>
          <p>
            <span className="axis-key">Blue arrow</span> rotation axis ·{" "}
            <span className="range-key">Amber arc</span> allowed range ·{" "}
            <span className="angle-key">Mint pointer</span> current solved
            angle. The overlay follows the parent body in every placement.
          </p>
          <p className="caption">
            {["thumb_CMC", "opposition"].includes(joint.id)
              ? "The thumb base uses intersecting serial hinges. Human CMC axes are oblique and offset, with coupled motion; this display exposes our approximation, not measured thumb anatomy."
              : ["flex", "deviation"].includes(joint.id)
                ? "Two serial hinges approximate the wrist. The eight carpal shapes move together with the palm; individual carpal motion and ligament forces are not solved."
                : joint.id.endsWith("_CMC")
                  ? "The ring and little metacarpals move to form the palm arch. Their axis and range are engineering assumptions, not participant-specific measurements."
                  : "Limits and axes describe this engineering model. They are not an individual participant’s measured range of motion."}
          </p>
        </>
      ) : (
        <p>
          Choose a joint to reveal its physical parent, rotation axis and
          movement range directly on the hand.
        </p>
      )}
      <details>
        <summary>Wrist anatomy & surface method</summary>
        <p>
          The schematic proximal carpal row contains scaphoid, lunate and
          triquetrum, with pisiform on the palmar side. The distal row contains
          trapezium, trapezoid, capitate and hamate. Shapes are not derived from
          a medical scan.
        </p>
        <p>
          Continuous digit surfaces use dual-quaternion skinning of the solved
          bones. This smooths the display across joints; skin pressure, tissue
          strain and soft-tissue contact are not simulated.
        </p>
      </details>
    </section>
  );
}
