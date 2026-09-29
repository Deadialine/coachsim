"""Offline Allegro adapter. SI units; privileged simulator state; no hardware IO."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / '.model-tools').exists():
    sys.path.insert(0, str(ROOT / '.model-tools'))
import mujoco
import numpy as np

ASSETS = ROOT / 'coach_sim/public/models/allegro'
MANIFEST = json.loads((ASSETS / 'manifest.json').read_text())


class AllegroReference:
    def __init__(self, hz=240, gravity=True):
        if hz not in (120, 240, 480):
            raise ValueError('Supported rates: 120, 240, 480 Hz')
        self.model = m = mujoco.MjModel.from_xml_path(str(ASSETS / 'right_hand.xml'))
        m.opt.timestep = 1 / hz
        m.opt.gravity[:] = [0, -9.81 if gravity else 0, 0]
        m.opt.integrator = mujoco.mjtIntegrator.mjINT_EULER
        m.opt.iterations = 100
        m.opt.tolerance = 1e-10
        # Source position servos and damping are not the browser drive law.
        m.opt.disableflags |= int(mujoco.mjtDisableBit.mjDSBL_ACTUATION)
        m.dof_damping[:] = 0
        m.dof_frictionloss[:] = 0
        m.geom_friction[:] = [0.8, 0, 0]
        m.geom_condim[:] = 3
        self.ids = [j['id'] for j in MANIFEST['joints']]
        joints = [m.joint(name).id for name in self.ids]
        self.qidx = m.jnt_qposadr[joints]
        self.vidx = m.jnt_dofadr[joints]
        self.ranges = np.array([j['rangeRad'] for j in MANIFEST['joints']])
        self.home = np.clip(np.zeros(16), self.ranges[:, 0], self.ranges[:, 1])
        self.data = mujoco.MjData(m)
        self.reset()

    def reset(self):
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[self.qidx] = self.home
        self.command = self.home.copy()
        self.torque = np.zeros(16)
        mujoco.mj_forward(self.model, self.data)
        return self.observe()

    def step(self, targets, enabled=True):
        target = np.asarray(targets, dtype=float)
        if target.shape != (16,) or not np.all(np.isfinite(target)) or np.any(target < self.ranges[:, 0]) or np.any(target > self.ranges[:, 1]):
            raise ValueError('16 finite in-range radian targets required')
        m, d, dt = self.model, self.data, self.model.opt.timestep
        mujoco.mj_forward(m, d)
        mass = np.empty((m.nv, m.nv))
        mujoco.mj_fullM(m, mass, d.qM)
        mass = mass[np.ix_(self.vidx, self.vidx)]
        self.command += np.clip(target - self.command, -2 * dt, 2 * dt)
        requested = self.command - d.qpos[self.qidx] - (dt + 0.02) * d.qvel[self.vidx]
        gain = dt * 0.02 + dt * dt
        acceleration = np.linalg.solve(mass + np.eye(16) * gain, requested)
        self.torque = np.clip(requested - gain * acceleration, -0.15, 0.15) if enabled else np.zeros(16)
        d.qfrc_applied[:] = 0
        d.qfrc_applied[self.vidx] = self.torque
        mujoco.mj_step(m, d)
        return self.observe()

    def observe(self):
        return dict(timeSeconds=float(self.data.time),
                    q=self.data.qpos[self.qidx].tolist(),
                    v=self.data.qvel[self.vidx].tolist(),
                    torque=self.torque.tolist(), command=self.command.tolist())
