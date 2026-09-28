"""Compile the pinned Menagerie MJCF; export resolved SI properties and FK fixtures.
Run with Python 3.12 + mujoco==3.6.0. No rendering or hardware required.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / '.model-tools').exists():
    sys.path.insert(0, str(ROOT / '.model-tools'))
import mujoco
import numpy as np

ASSETS = ROOT / 'coach_sim/public/models/allegro'
model = mujoco.MjModel.from_xml_path(str(ASSETS / 'right_hand.xml'))
data = mujoco.MjData(model)
mujoco.mj_forward(model, data)
def name(kind, i):
    return mujoco.mj_id2name(model, kind, i)
def quat(q):
    return dict(zip(('w', 'x', 'y', 'z'), map(float, q)))
def vec(v):
    return dict(zip(('x', 'y', 'z'), map(float, v)))

bodies = []
for i in range(1, model.nbody):
    geoms = []
    for g in range(model.ngeom):
        if model.geom_bodyid[g] != i:
            continue
        typ = int(model.geom_type[g])
        item = dict(type={2:'sphere', 3:'capsule', 6:'box', 7:'mesh'}[typ],
                    position=vec(model.geom_pos[g]), rotation=quat(model.geom_quat[g]),
                    size=model.geom_size[g].tolist(), collision=bool(model.geom_contype[g]),
                    rgba=model.geom_rgba[g].tolist())
        if typ == 7:
            m = model.geom_dataid[g]
            item['file'] = name(mujoco.mjtObj.mjOBJ_MESH, m) + '.stl'
            # MuJoCo centers/rotates mesh vertices internally; undo that transform
            # when positioning the original STL, which remains in source coordinates.
            item['meshPosition'] = vec(model.mesh_pos[m])
            item['meshRotation'] = quat(model.mesh_quat[m])
            mat = model.geom_matid[g]
            if mat >= 0: item['rgba'] = model.mat_rgba[mat].tolist()
        geoms.append(item)
    bodies.append(dict(id=name(mujoco.mjtObj.mjOBJ_BODY,i),
                       parent=name(mujoco.mjtObj.mjOBJ_BODY,int(model.body_parentid[i])),
                       position=vec(model.body_pos[i]), rotation=quat(model.body_quat[i]),
                       bindPosition=vec(data.xpos[i]), bindRotation=quat(data.xquat[i]),
                       massKg=float(model.body_mass[i]), centerOfMass=vec(model.body_ipos[i]),
                       principalInertiaKgM2=vec(model.body_inertia[i]),
                       inertiaRotation=quat(model.body_iquat[i]), geoms=geoms))
joints=[]
for a in range(model.nu):
    j=int(model.actuator_trnid[a,0])
    joints.append(dict(id=name(mujoco.mjtObj.mjOBJ_JOINT,j), actuator=name(mujoco.mjtObj.mjOBJ_ACTUATOR,a),
                       body=name(mujoco.mjtObj.mjOBJ_BODY,int(model.jnt_bodyid[j])),
                       axis=vec(model.jnt_axis[j]), position=vec(model.jnt_pos[j]),
                       rangeRad=model.jnt_range[j].tolist(), controlRangeRad=model.actuator_ctrlrange[a].tolist(),
                       sourceKp=float(model.actuator_gainprm[a,0]), damping=float(model.dof_damping[j])))
fixtures=[]
for fraction in (0, .25, .65):
    data.qpos[:]=[max(j['rangeRad'][0],min(j['rangeRad'][1],0)) if fraction==0 else j['rangeRad'][0]+fraction*(j['rangeRad'][1]-j['rangeRad'][0]) for j in joints]
    mujoco.mj_forward(model,data)
    M=np.zeros((model.nv,model.nv))
    mujoco.mj_fullM(model,M,data.qM)
    fixtures.append(dict(fraction=fraction,qposRad=data.qpos.tolist(),massMatrixKgM2=M.tolist(), bodies=[dict(id=name(mujoco.mjtObj.mjOBJ_BODY,i),position=vec(data.xpos[i]),rotation=quat(data.xquat[i])) for i in range(1,model.nbody)]))
files={str(p.relative_to(ASSETS)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ASSETS.rglob('*')) if p.is_file() and p.name!='manifest.json'}
manifest=dict(schema='coachsim-robot-model-1',id='allegro-v3-right-menagerie',
              sourceCommit='71f066ad0be9cd271f7ed58c030243ef157af9f4',source='https://github.com/google-deepmind/mujoco_menagerie/tree/71f066ad0be9cd271f7ed58c030243ef157af9f4/wonik_allegro',
              compiler='MuJoCo '+mujoco.__version__,license='BSD-2-Clause',units='m, kg, s, rad',
              inertiaProvenance='Upstream visual-mesh density 800 kg/m3; not measured link inertias',
              exclusions=[['palm','ff_base'],['palm','mf_base'],['palm','rf_base'],['palm','th_base'],['palm','th_proximal']],
              bodies=bodies,joints=joints,fixtures=fixtures,sha256=files)
(ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(bodies=len(bodies),joints=len(joints),totalMassKg=sum(b['massKg'] for b in bodies),compiler=manifest['compiler'])))
