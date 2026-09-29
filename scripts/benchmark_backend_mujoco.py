"""Run the frozen comparison fixtures without renderer or GPU."""
import gzip
import json
import platform
import time
from reference_backend import ROOT, AllegroReference, mujoco, np

PROTOCOL = json.loads((ROOT / 'scripts/backend-protocol.json').read_text())


def primitive(c, hz):
    r, mass = PROTOCOL['radiusM'], PROTOCOL['massKg']
    solref = '0.02 0.2' if c['id'] == 'bounce' else '0.02 1'
    # Three slide joints constrain box rotation identically to Rapier lockRotations.
    joints = '<joint type="slide" axis="1 0 0"/><joint type="slide" axis="0 1 0"/><joint type="slide" axis="0 0 1"/>' if c['box'] else '<freejoint/>'
    shape = f'type="box" size="{r} {r} {r}"' if c['box'] else f'type="sphere" size="{r}"'
    floor = '<geom type="plane" size="10 10 0.05"/>' if c['floor'] else ''
    xml = f'''<mujoco><option timestep="{1/hz}" gravity="0 0 -9.81" integrator="Euler" solver="Newton" iterations="100" tolerance="1e-10" cone="elliptic"/>
      <default><geom friction="0.5 0 0" condim="3" solref="{solref}" solimp="0.9 0.95 0.001"/></default>
      <worldbody>{floor}<body pos="0 0 {c['heightM']}">{joints}<geom {shape} mass="{mass}"/></body></worldbody></mujoco>'''
    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    d.qvel[0] = c['vx']
    trace, start = [], time.perf_counter()
    for _ in range(round(hz*c['seconds'])):
        mujoco.mj_step(m, d)
        p = d.qpos[:3].copy()
        if c['box']:
            p[2] += c['heightM']
        trace.append(dict(timeSeconds=float(d.time), p=p.tolist(), v=d.qvel[:3].tolist()))
    return dict(id=c['id'], hz=hz, kind='primitive', seconds=c['seconds'], wallSeconds=time.perf_counter()-start, trace=trace)


def main():
    cases = []
    for hz in PROTOCOL['ratesHz']:
        cases.extend(primitive(c, hz) for c in PROTOCOL['primitives'])
        for name in PROTOCOL['robotCases']:
            env = AllegroReference(hz, gravity=name != 'passive-zero')
            trace, start = [], time.perf_counter()
            for i in range(hz * PROTOCOL['robotSeconds']):
                target = env.home.copy()
                if i >= hz // 2 and name == 'step':
                    target[1] = 0.4
                if i >= hz // 2 and name == 'limit':
                    target[1] = env.ranges[1, 1]
                trace.append(env.step(target, enabled=not name.startswith('passive')))
            cases.append(dict(id=name, hz=hz, kind='robot', seconds=PROTOCOL['robotSeconds'], wallSeconds=time.perf_counter()-start, trace=trace))
        print('MuJoCo completed', hz, 'Hz', flush=True)
    payload = dict(schema='coachsim-backend-traces-1', engine=f'MuJoCo {mujoco.__version__}', protocol=PROTOCOL['id'],
                   hardware=dict(cpu=platform.processor(), platform=platform.system(), arch=platform.machine(), runtime=platform.python_version(), numpy=np.__version__), cases=cases)
    with gzip.GzipFile(ROOT / 'evidence/backend-mujoco-traces.json.gz', 'wb', mtime=0) as f:
        f.write(json.dumps(payload, allow_nan=False).encode())


if __name__ == '__main__':
    main()
