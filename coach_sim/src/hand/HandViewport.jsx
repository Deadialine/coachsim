import React, { useEffect, useRef, useState } from "react";
import { createHand, initPhysics } from "./physics.mjs";
import { createScene } from "./scene.mjs";
import { createTrial } from "./trials.mjs";

export default function HandViewport({
  controls,
  trial,
  onTrialReport,
  setup,
  observation,
  appearance,
  paused,
  active = true,
  reset,
  ballRequest,
  cameraView,
  cameraVersion = 0,
  onDiagnostics,
}) {
  const host = useRef(null),
    engine = useRef(null),
    current = useRef({ controls, appearance, paused, active, onDiagnostics });
  current.current = {
    controls,
    appearance,
    paused,
    active,
    onDiagnostics,
    cameraView,
    setup,
    trial,
    onTrialReport,
    observation,
  };
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false,
      frame,
      model,
      scene;
    setError("");
    setLoading(true);
    (async () => {
      try {
        await initPhysics();
        if (cancelled) return;
        model = createHand(current.current.setup);
        const runner = current.current.trial
          ? createTrial(model, current.current.trial)
          : null;
        let completeReported = false;
        scene = createScene(host.current, model);
        scene.view(current.current.cameraView);
        engine.current = { model, scene };
        setLoading(false);
        let last = performance.now(),
          report = 0;
        function tick(now) {
          if (cancelled) return;
          const state = current.current;
          try {
            if (!state.active || document.hidden) {
              last = now;
              frame = requestAnimationFrame(tick);
              return;
            }
            if (runner) {
              if (!state.paused)
                runner.advance(Math.max(0, (now - last) / 1000));
            } else if (state.observation) {
              if (state.observation.q)
                model.setObservedPalmOrientation(state.observation.q);
            } else if (!state.paused)
              model.advance((now - last) / 1000, state.controls);
            last = now;
            scene.draw(
              {
                ...state.appearance,
                observation: !!state.observation,
                gravity: state.controls.gravity,
                trial: !!runner,
                trails: !!runner || state.appearance.trails,
              },
              !state.paused && !state.observation && !runner,
            );
            if (now - report > 200) {
              state.onDiagnostics?.(
                state.observation ? null : model.diagnostics(),
              );
              if (runner && !completeReported) {
                state.onTrialReport?.(runner.report(runner.complete));
                completeReported = runner.complete;
              }
              report = now;
            }
            frame = requestAnimationFrame(tick);
          } catch (e) {
            setError(
              `Simulation stopped: ${e.message}. Return to manual physics or reset the model to retry.`,
            );
            if (runner)
              state.onTrialReport?.({
                ...runner.report(false),
                error: e.message,
              });
          }
        }
        frame = requestAnimationFrame(tick);
      } catch (e) {
        setError(
          `The 3D workspace could not start: ${e.message}. Enable WebGL in your browser and reload.`,
        );
        setLoading(false);
        scene?.dispose();
        model?.dispose();
        scene = null;
        model = null;
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      engine.current = null;
      scene?.dispose();
      model?.dispose();
    };
  }, [reset]);
  useEffect(() => {
    if (ballRequest) engine.current?.model.placeBall();
  }, [ballRequest]);
  useEffect(() => {
    engine.current?.scene.view(cameraView);
  }, [cameraView, cameraVersion]);
  return (
    <div className="hand-viewport" ref={host}>
      {loading && (
        <div className="viewport-message" role="status">
          Building articulated hand…
        </div>
      )}
      {error && (
        <div className="viewport-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
