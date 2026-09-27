export const DEFAULT_OBJECT = Object.freeze({
  radius: 0.027,
  mass: 0.06,
  friction: 0.9,
});
export function objectConfiguration(input = {}) {
  const config = { ...DEFAULT_OBJECT, ...input };
  for (const [key, min, max] of [
    ["radius", 0.01, 0.06],
    ["mass", 0.01, 0.5],
    ["friction", 0, 2],
  ])
    if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max)
      throw Error(`${key} must be between ${min} and ${max}.`);
  return config;
}
export function validateJointTargets(targets, joints) {
  if (targets === undefined) return;
  if (!targets || typeof targets !== "object" || Array.isArray(targets))
    throw Error("Joint targets must be a named angle map.");
  for (const [id, value] of Object.entries(targets)) {
    const joint = joints.find((j) => j.id === id);
    if (
      !joint ||
      !Number.isFinite(value) ||
      value < joint.range[0] ||
      value > joint.range[1]
    )
      throw Error(`Invalid joint target: ${id}.`);
  }
}
