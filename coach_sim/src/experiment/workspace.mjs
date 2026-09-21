import { CLASSES, CONFIG } from "./core.mjs";

export const DEFAULT_LAYOUT = [
  { id: "emg_ch1", name: "EMG 1", surface: "palmar", x: 36, y: 38 },
  { id: "emg_ch2", name: "EMG 2", surface: "palmar", x: 64, y: 62 },
  { id: "emg_ch3", name: "EMG 3", surface: "dorsal", x: 35, y: 42 },
  { id: "emg_ch4", name: "EMG 4", surface: "dorsal", x: 64, y: 66 },
  { id: "imu", name: "MPU6050", surface: "dorsal", x: 50, y: 50 },
];
export function normalizeLayout(input) {
  return DEFAULT_LAYOUT.map((defaultSite) => {
    const site = Array.isArray(input)
      ? input.find((s) => s?.id === defaultSite.id)
      : null;
    return {
      ...defaultSite,
      x: Number.isFinite(site?.x)
        ? Math.max(10, Math.min(90, site.x))
        : defaultSite.x,
      y: Number.isFinite(site?.y)
        ? Math.max(10, Math.min(90, site.y))
        : defaultSite.y,
      surface:
        defaultSite.id === "imu"
          ? "dorsal"
          : ["palmar", "dorsal"].includes(site?.surface)
            ? site.surface
            : defaultSite.surface,
    };
  });
}
export function coachingDecision({
  prediction,
  status,
  target,
  eventType,
  qualityOk,
  t,
}) {
  const gates = {
    quality: !!qualityOk && prediction?.quality_ok === 1,
    confidence: !!prediction && prediction.confidence >= CONFIG.confidence_min,
    freshness:
      !!prediction && t >= prediction.t_us && t - prediction.t_us <= 250000,
    recognized: CLASSES.includes(status?.label),
    stability: !!status?.stable,
  };
  if (!prediction || !target)
    return {
      state: "WAITING",
      message: "Start a session or select a replay position.",
      gates,
    };
  if (
    !gates.quality ||
    !gates.confidence ||
    !gates.freshness ||
    !gates.recognized
  )
    return {
      state: "UNCERTAIN",
      message:
        "Feedback withheld: check the signal-quality, confidence, and freshness gates.",
      gates,
    };
  if (eventType === "complete")
    return {
      state: "COMPLETE",
      message: "The planned sequence is complete.",
      gates,
    };
  if (!gates.stability)
    return {
      state: "SETTLING",
      message: "Wait for a stable prediction before responding.",
      gates,
    };
  if (eventType === "rest")
    return {
      state: "REST",
      message: "Rest interval: return to the neutral posture.",
      gates,
    };
  if (status.label !== target)
    return {
      state: "ADJUST",
      message: `The predicted posture differs from the target. Follow the ${target.replaceAll("_", " ")} cue.`,
      gates,
    };
  return {
    state: "HOLD",
    message:
      "Predicted posture matches the target. Hold through the cue interval.",
    gates,
  };
}
export function addOperatorNote(session, { text, t_us, target }) {
  const content = String(text ?? "").trim();
  if (!content || content.length > 1500)
    throw Error("Enter a note of 1–1,500 characters.");
  if (!Number.isFinite(t_us) || t_us < 0 || t_us > session.duration_us)
    throw Error("Note time must be inside the session.");
  const notes = Array.isArray(session.operator_notes)
    ? session.operator_notes
    : [];
  if (notes.length >= 500)
    throw Error(
      "This session already has 500 notes. Export it before creating a new session.",
    );
  session.operator_notes = [
    ...notes,
    {
      t_us,
      text: content,
      target: CLASSES.includes(target) ? target : "unknown",
      kind: "operator_annotation",
    },
  ];
}
