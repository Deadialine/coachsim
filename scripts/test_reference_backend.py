import unittest
from reference_backend import AllegroReference, MANIFEST, mujoco, np


class ReferenceTests(unittest.TestCase):
    def test_compiled_pose_and_inertia_fixtures_survive_adapter_changes(self):
        e = AllegroReference()
        for fixture in MANIFEST['fixtures']:
            e.data.qpos[e.qidx] = fixture['qposRad']
            mujoco.mj_forward(e.model, e.data)
            mass = np.empty((16, 16))
            mujoco.mj_fullM(e.model, mass, e.data.qM)
            np.testing.assert_allclose(mass[np.ix_(e.vidx, e.vidx)], fixture['massMatrixKgM2'], atol=1e-10, rtol=0)
            for body in fixture['bodies']:
                actual = e.data.body(body['id'])
                np.testing.assert_allclose(actual.xpos, [body['position'][k] for k in ('x', 'y', 'z')], atol=1e-10, rtol=0)
                self.assertGreater(abs(np.dot(actual.xquat, [body['rotation'][k] for k in ('w', 'x', 'y', 'z')])), 1-1e-10)

    def test_asset_mapping_and_mass(self):
        e = AllegroReference()
        self.assertEqual(e.ids, [j['id'] for j in MANIFEST['joints']])
        self.assertEqual(len(set(e.vidx)), 16)
        self.assertAlmostEqual(float(e.model.body_mass.sum()), sum(b['massKg'] for b in MANIFEST['bodies']), places=10)
        self.assertTrue(np.all(e.model.dof_damping == 0))
        self.assertEqual(e.model.opt.disableflags & int(mujoco.mjtDisableBit.mjDSBL_ACTUATION), int(mujoco.mjtDisableBit.mjDSBL_ACTUATION))

    def test_invalid_action_is_atomic(self):
        e = AllegroReference()
        initial = e.observe()
        for action in ([0], [float('nan')]*16, [99]*16):
            with self.assertRaises(ValueError):
                e.step(action)
            self.assertEqual(initial, e.observe())
        with self.assertRaises(ValueError):
            AllegroReference(0)

    def test_zero_gravity_reset_and_bounded_drive(self):
        for hz in (120, 240, 480):
            e = AllegroReference(hz, gravity=False)
            for _ in range(hz // 2):
                e.step(e.home, enabled=False)
            np.testing.assert_allclose(e.observe()['q'], e.home, atol=1e-8)
            target = e.home.copy()
            target[1] = 0.4
            e.reset()
            first = e.step(target)
            self.assertLessEqual(max(abs(x) for x in first['torque']), 0.15)
            self.assertAlmostEqual(first['command'][1], 2/hz)
            for _ in range(hz):
                s = e.step(target)
                self.assertTrue(np.isfinite(s['q']).all())
                self.assertLessEqual(max(abs(x) for x in s['torque']), 0.15)
            self.assertLess(abs(s['q'][1]-0.4), 0.02)
            e.reset()
            self.assertEqual(first, e.step(target))


if __name__ == '__main__':
    unittest.main()
