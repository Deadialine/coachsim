# Orientation laboratory

The hand now supports arbitrary manual forearm placement and recorded/live six-axis IMU observation. These are separate modes. All six experiment workspaces remain available; orientation samples do not silently replace the experiment bundle, EMG signals, or coaching predictions.

## Manual physics

Choose a placement preset or set roll, pitch and yaw, then **Apply placement · restart physics**. This resets the physical trial while retaining joint targets. Camera orbit never changes gravity or arm placement. The 25 joint axes, body inertias, local anchors and anatomical surfaces start in the same transformed frame. Gravity remains `(0,-9.81,0)` m/s² in world coordinates. The lab support origin is `(0,0,0)` m; the floor is at -0.6 m to clear the approximately 0.45 m model in all starting directions.

Placement uses active local-to-world quaternions stored as named `{x,y,z,w}` fields. Euler controls in degrees compose `Rz(yaw) Ry(pitch) Rx(roll)`; they are setup controls, not ISB anatomical angles. Existing signed anatomical joint coordinates are unchanged. Dorsal/palmar/side camera presets use the current palm frame while camera up remains world up. World axes use red X, green Y, blue Z. The optional contact overlay uses actual solver collider dimensions/transforms, excluding virtual joint carriers. Surface rendering remains a visual approximation.

**Export setup & snapshot** saves setup, controls and current diagnostics. Recreate the initial conditions with those settings; the diagnostic snapshot is not a serialized continuation of velocities, contact impulses or motor history. A view changed midway through a trial is not an independently reproducible motion history.

## IMU observation

Use **Load synthetic demo**, **Import IMU CSV**, or **Connect live IMU**. The seven required fields are:

```csv
t_us,ax,ay,az,gx,gy,gz
0,0,1,0,0,0,0
10000,0,1,0,0,0,0
```

Time is monotonic microseconds; acceleration is in g; gyroscope values are degrees/second. Stationary acceleration points opposite gravitational acceleration (up). The existing session `imu.csv` header is accepted, but a recording must actually satisfy the calibration requirements. Extra columns are ignored. Imported provenance is explicitly unverified. CSVs are limited to 10 MB / 60,000 samples.

Begin with at least 101 samples spanning one stationary second. Initialization estimates mean gyro bias and aligns mean acceleration to world +Y. Required mean acceleration norm: 0.9–1.1 g; mean gyro norm ≤5°/s; per-axis acceleration variance ≤0.0025 g²; per-axis gyro variance ≤1 (°/s)². Constant slow motion can pass these thresholds: the operator must really hold still. Mount identity is an explicit assumption until alignment. **Align sample to setup orientation** assumes that this sample was captured with the hand in the known setup orientation; it is an operator-supplied calibration, not an automatically observed anatomical landmark.

The baseline estimator (`coachsim-complementary-1`) integrates bias-corrected body-frame angular velocity using unit quaternions. A 0.5 s first-order tilt correction aligns transformed acceleration with world up when its magnitude is within 0.1 g of 1 g. Outside that range it reports gyro-only integration. Norm gating cannot detect all linear accelerations, and the initial bias estimate does not track temperature-dependent changes. This is a transparent baseline, **not an implementation of VQF**, and no published VQF accuracy is attributed to it.

Samples must be finite. Intervals below 1 ms, non-monotonic timestamps, or intervals above 50 ms stop estimation and require fresh calibration. Smaller irregular intervals are integrated using their timestamps; this is not a packet-loss audit. Absolute heading is unobservable without an additional reference and can drift. No magnetometer is assumed. Quaternion output is sensor-to-world; the fixed mounting correction is multiplied on the right to obtain hand-to-world orientation.

The displayed articulation is frozen when observation starts. The whole illustrative chain rotates about the palm; forearm orientation, finger articulation and position are **not measured**. Forces, contacts and dynamic readouts are suspended. Returning to manual placement recreates the model before advancing physics. Playback supports play/pause and timestamp scrubbing. Hidden pages pause playback and disconnect live input. Exports retain raw samples, estimates, bias, mounting transform, units, input status, filter version and provenance.

## Live input contract

A compatible secure desktop browser must support Web Serial. The user chooses a port. The app opens it at 115200 baud and reads only; it sends no firmware commands. Firmware must emit newline-delimited JSON with the same seven numeric fields, for example:

```json
{"t_us":10000,"ax":0,"ay":1,"az":0,"gx":0,"gy":0,"gz":0}
```

Lines over 4096 characters, malformed JSON, invalid samples and estimator faults stop the connection. One second without valid incoming samples stops observation; reconnect to recalibrate. Recording stops at 60,000 samples. Disconnect releases the reader and port. Actual hardware/firmware transport is **not verified** by the simulated tests.

## Research basis and validation still required

| Source | Applied here | Boundary |
| --- | --- | --- |
| [Wu et al. (2005), ISB coordinate recommendations](https://pubmed.ncbi.nlm.nih.gov/15844264/) | Report world, segment and joint frames separately. | This engineering model is not an ISB landmark-calibrated participant model. Bibliographic/indexed scope reviewed. |
| [Hicks et al. (2015), verification and validation](https://pubmed.ncbi.nlm.nih.gov/25474098/) | Separate numerical verification from experimental validity; state outputs and assumptions. | Abstract/indexed recommendations reviewed; no claim of implementing every checklist item. |
| [Laidig & Seel (2023), VQF](https://arxiv.org/pdf/2203.17024) and [author frame/mounting documentation](https://vqf.readthedocs.io/en/stable/faq.html) | Quaternion composition, explicit six-axis heading limitations, and a benchmark target for subsequent sensor validation. | Full-text orientation/benchmark discussion and documentation reviewed. Our baseline filter differs; benchmark VQF on the same held-out recordings before selecting the final study estimator. |

Before claiming experimental accuracy, collect synchronized independent orientation references (optical tracking or a characterized rotation fixture), document sensor mounting and anatomical calibration, and preregister tolerances appropriate to the classification task. Include upright, inverted, horizontal and oblique postures; slow and fast motions; stationary holds; remounting across sessions; temperature/bias drift; and linear-acceleration disturbances. Reserve sessions for validation. Report quaternion geodesic error, tilt error separately from heading drift, timing offset/jitter, missing-sample rate and failure counts. Compare this baseline against VQF with identical data and alignment conventions. Participant-specific geometry, joint axes and soft-tissue/tendon mechanics remain separate modeling work.

These protocol choices are proposed study design, not completed physical experiments. See [software verification](../evidence/ORIENTATION_VERIFICATION.md).
