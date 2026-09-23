const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Engineering command filter, not a model of neural activation. Keeping velocity
// as state avoids the abrupt start/reversal of the former constant-rate ramp.
export function smoothCommand(position, velocity, target, dt) {
  const acceleration = clamp(
    100 * (target - position) - 20 * velocity,
    -600,
    600,
  );
  const nextVelocity = clamp(velocity + acceleration * dt, -120, 120);
  return { position: position + nextVelocity * dt, velocity: nextVelocity };
}

// Optional qualitative tenodesis illustration. Negative wrist angle is
// extension. Constants are declared assumptions, not fitted participant data.
export function coupledCurl(voluntary, wristAngle, gain) {
  return clamp(
    voluntary + gain * (0.18 - (wristAngle / 70) * 0.3) * (1 - voluntary),
    0,
    1,
  );
}
