export const DIGITS = ["index", "middle", "ring", "little"];
export const DEFAULT_CONTROLS = {
  flex: 0,
  deviation: 0,
  rotation: 0,
  index: 0,
  middle: 0,
  ring: 0,
  little: 0,
  thumb: 0,
  opposition: 0,
  spread: 0,
  gravity: true,
  motors: true,
  strength: 4,
};
export const PRESETS = {
  neutral_rest: { flex: 0, deviation: 0, rotation: 0 },
  wrist_flexion: { flex: 45, deviation: 0, rotation: 0 },
  wrist_extension: { flex: -40, deviation: 0, rotation: 0 },
  radial_deviation: { flex: 0, deviation: 18, rotation: 0 },
  ulnar_deviation: { flex: 0, deviation: -28, rotation: 0 },
  forearm_pronation: { flex: 0, deviation: 0, rotation: -65 },
  forearm_supination: { flex: 0, deviation: 0, rotation: 65 },
};
