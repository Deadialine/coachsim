# Compact thesis-hand workspace

The hand remains in one persistent viewport. A separate scrolling toolbox groups all existing functions into Move, Orientation, Appearance, Inspect, Trials, Robotics and Study. Each panel remains mounted and retains its own scroll position; switching tools does not rebuild the physics model, discard IMU recordings or cancel a trial.

- **Move:** seven study postures in one selector, wrist/forearm sliders, expandable finger/grasp and force/contact settings.
- **Orientation:** arbitrary placement, IMU imports, synthetic demonstration, live connection and setup export.
- **Appearance:** surface/anatomy/tendon views, labels, sensor sites, trails, collision geometry and digit tracing.
- **Inspect:** joint selection, connection details, response measurements and full joint table.
- **Trials:** motion protocols, orientation scoring, plots and exports.
- **Robotics:** independent joint commands and contact-object configuration.
- **Study:** sensor scope, model assumptions and limitations.

Pause/resume, reset, camera views and live physics diagnostics stay beside the hand. Trial/observation locks remain in force. The experiment session is an expandable bar in the 3D workspace; the six main workspaces and session controls remain available. Alerts remain outside the collapsed session bar.

Desktop uses a viewport-sized horizontal split. Narrow screens use a vertical stage/toolbox split with independent panel scrolling. Arrow keys, Home and End navigate the tool tabs; panels are keyboard-focusable. Existing 56 regression tests and production build pass. Browser checks cover all seven tools, posture preservation across tool/main-workspace changes, keyboard navigation, active-trial locks and pause, session access, and a 390 × 844 responsive viewport. No physics, acquisition schema or classifier behavior changes are included.
