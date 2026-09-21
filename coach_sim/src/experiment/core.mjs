export const CLASSES = [
  "neutral_rest",
  "wrist_flexion",
  "wrist_extension",
  "radial_deviation",
  "ulnar_deviation",
  "forearm_pronation",
  "forearm_supination",
];
export const CONFIG = Object.freeze({
  id: "coachsim-sim-v2.0",
  emg_hz: 2000,
  imu_hz: 100,
  channels: 4,
  adc_min: 0,
  adc_max: 4095,
  window_us: 200000,
  hop_us: 50000,
  confidence_min: 0.7,
  stability_us: 250000,
});
export const HEADERS = {
  emg: [
    "sample_index",
    "t_us",
    "emg_ch1",
    "emg_ch2",
    "emg_ch3",
    "emg_ch4",
    "adc_flags",
  ],
  imu: [
    "sample_index",
    "t_us",
    "ax",
    "ay",
    "az",
    "gx",
    "gy",
    "gz",
    "sensor_flags",
  ],
  events: ["t_us", "event_type", "target_posture", "repetition", "block"],
  predictions: [
    "t_us",
    "predicted_posture",
    "confidence",
    "model_version",
    "latency_ms",
    "quality_ok",
  ],
};
export const V1_HEADER =
  "schema_version,seq,t_us,rtc_health,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,emg_uV,fsr_N,strain_uE,resp_raw,reserved0,reserved1";
export function random(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
export function schedule(seed = 20260921, repetitions = 8) {
  const rng = random(seed),
    events = [];
  let t = 0;
  for (let r = 1; r <= repetitions; r++) {
    const order = [...CLASSES];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const c of order) {
      events.push({
        t_us: t,
        event_type: "cue",
        target_posture: c,
        repetition: r,
        block: r,
      });
      t += 3000000;
      events.push({
        t_us: t,
        event_type: "rest",
        target_posture: "neutral_rest",
        repetition: r,
        block: r,
      });
      t += 3000000;
    }
  }
  events.push({
    t_us: t,
    event_type: "complete",
    target_posture: "neutral_rest",
    repetition: repetitions,
    block: repetitions,
  });
  return events;
}
export function atTime(rows, t) {
  let lo = 0,
    hi = rows.length - 1,
    answer = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m].t_us <= t) {
      answer = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return answer < 0 ? null : rows[answer];
}
export function newSession({
  seed = 20260921,
  participant = "SIM-001",
  session = "SIM-S01",
  now = Date.now() / 1000,
} = {}) {
  return {
    session: {
      schema_version: 2,
      participant_id: participant,
      session_id: session,
      t0_unix: Math.floor(now),
      time_origin: "session_start",
      provenance: "synthetic",
      device_version: "virtual-node-2.0",
      firmware_version: "not-hardware",
      model_version: "synthetic-overlay-1",
      config: { ...CONFIG },
      channel_map: Array.from({ length: 4 }, (_, i) => ({
        id: `emg_ch${i + 1}`,
        unit: "adc_count",
        placement: "simulated",
        calibrated: false,
      })),
      placement_metadata: { mode: "simulation" },
      seed,
      duration_us: 0,
    },
    emg: [],
    imu: [],
    events: [],
    predictions: [],
  };
}
// Deterministic multisine test source; it is not a physiological or trained model.
export function emgRow(i, posture = "neutral_rest", fault = false) {
  const t = i / 2000,
    k = CLASSES.indexOf(posture),
    a = k <= 0 ? 12 : 100 + 35 * k;
  const row = { sample_index: i, t_us: i * 500 };
  for (let c = 1; c <= 4; c++)
    row[`emg_ch${c}`] = fault
      ? 4095
      : Math.round(
          2048 +
            a * (1 + c * 0.1) * Math.sin(2 * Math.PI * (67 + c * 13) * t + c) +
            a * 0.33 * Math.sin(2 * Math.PI * (173 + c * 7) * t),
        );
  row.adc_flags = fault ? 1 : 0;
  return row;
}
export function imuRow(i, posture = "neutral_rest") {
  const t = i / 100,
    k = CLASSES.indexOf(posture),
    a = k <= 0 ? 0.005 : 0.15;
  return {
    sample_index: i,
    t_us: i * 10000,
    ax: a * Math.sin(t * 2),
    ay: a * Math.cos(t * 2),
    az: 1 + a * 0.2 * Math.sin(t),
    gx: a * 30 * Math.cos(t * 2),
    gy: a * 20 * Math.sin(t * 2),
    gz: a * 10 * Math.cos(t),
    sensor_flags: 0,
  };
}
export function predictionRow(t, posture, fault = false) {
  return {
    t_us: t,
    predicted_posture: fault ? "uncertain" : posture,
    confidence: fault ? 0.2 : 0.87,
    model_version: "synthetic-overlay-1",
    latency_ms: 25,
    quality_ok: fault ? 0 : 1,
  };
}
export function appendSimulation(bundle, endUs, plan, { fault = false } = {}) {
  const start = bundle.session.duration_us;
  for (let i = Math.ceil(start / 500); i * 500 < endUs; i++)
    bundle.emg.push(emgRow(i, atTime(plan, i * 500)?.target_posture, fault));
  for (let i = Math.ceil(start / 10000); i * 10000 < endUs; i++)
    bundle.imu.push(imuRow(i, atTime(plan, i * 10000)?.target_posture));
  for (let t = Math.ceil(start / 50000) * 50000; t < endUs; t += 50000)
    bundle.predictions.push(
      predictionRow(
        t,
        atTime(plan, t)?.target_posture || "neutral_rest",
        fault,
      ),
    );
  bundle.events.push(...plan.filter((e) => e.t_us >= start && e.t_us < endUs));
  bundle.session.duration_us = endUs;
}
export function displayPrediction(p, t, previous) {
  if (
    !p ||
    p.quality_ok !== 1 ||
    p.confidence < CONFIG.confidence_min ||
    t - p.t_us > 250000 ||
    t < p.t_us ||
    !CLASSES.includes(p.predicted_posture)
  )
    return { label: "uncertain", since: t, stable: false };
  const since = previous?.label === p.predicted_posture ? previous.since : t;
  return {
    label: p.predicted_posture,
    since,
    stable: t - since >= CONFIG.stability_us,
  };
}
export function signalQualityAt(b, t) {
  const e = atTime(b.emg, t),
    m = atTime(b.imu, t);
  if (!e || !m || t - e.t_us > 10000 || t - m.t_us > 50000) return false;
  const ei = b.emg.indexOf(e),
    mi = b.imu.indexOf(m);
  for (let i = ei; i >= 0 && b.emg[i].t_us > t - CONFIG.window_us; i--) {
    const r = b.emg[i];
    if (
      r.adc_flags ||
      [1, 2, 3, 4].some(
        (c) => r[`emg_ch${c}`] <= 0 || r[`emg_ch${c}`] >= 4095,
      ) ||
      (i > 0 &&
        (r.sample_index - b.emg[i - 1].sample_index !== 1 ||
          r.t_us - b.emg[i - 1].t_us > 1000))
    )
      return false;
  }
  for (let i = mi; i >= 0 && b.imu[i].t_us > t - CONFIG.window_us; i--) {
    const r = b.imu[i];
    if (
      r.sensor_flags ||
      (i > 0 &&
        (r.sample_index - b.imu[i - 1].sample_index !== 1 ||
          r.t_us - b.imu[i - 1].t_us > 20000))
    )
      return false;
  }
  return true;
}
export function toCSV(rows, headers) {
  return (
    headers.join(",") +
    "\n" +
    rows
      .map((r) =>
        headers
          .map((h) => {
            const s = String(r[h] ?? "");
            return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
          })
          .join(","),
      )
      .join("\n") +
    "\n"
  );
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("Unclosed CSV quote");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  if (new Set(headers).size !== headers.length)
    throw Error("Duplicate CSV headers");
  return {
    headers,
    rows: rows.map((r, i) => {
      if (r.length !== headers.length)
        throw Error(`CSV row ${i + 2}: wrong column count`);
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    }),
  };
}
const numeric = new Set([
  "sample_index",
  "t_us",
  "emg_ch1",
  "emg_ch2",
  "emg_ch3",
  "emg_ch4",
  "adc_flags",
  "ax",
  "ay",
  "az",
  "gx",
  "gy",
  "gz",
  "sensor_flags",
  "repetition",
  "block",
  "confidence",
  "latency_ms",
  "quality_ok",
]);
export function bundleFiles(b) {
  validateBundle(b);
  const f = { "session.json": JSON.stringify(b.session, null, 2) + "\n" };
  for (const key of Object.keys(HEADERS))
    f[`${key}.csv`] = toCSV(b[key], HEADERS[key]);
  return f;
}
export function readBundleFiles(files) {
  const b = { session: JSON.parse(files["session.json"]) };
  for (const key of Object.keys(HEADERS)) {
    if (typeof files[`${key}.csv`] !== "string")
      throw Error(`Missing ${key}.csv`);
    const csv = parseCSV(files[`${key}.csv`]);
    if (csv.headers.join(",") !== HEADERS[key].join(","))
      throw Error(`Unexpected ${key} header`);
    b[key] = csv.rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          numeric.has(k) ? (v.trim() === "" ? NaN : Number(v)) : v,
        ]),
      ),
    );
  }
  validateBundle(b);
  return b;
}
export function validateBundle(b) {
  const m = b?.session;
  if (m?.schema_version !== 2) throw Error("Expected schema version 2");
  if (!["synthetic", "recorded", "legacy_unverified"].includes(m.provenance))
    throw Error("Missing data provenance");
  for (const key of [
    "participant_id",
    "session_id",
    "device_version",
    "firmware_version",
  ])
    if (typeof m[key] !== "string" || !m[key]) throw Error(`Missing ${key}`);
  if (
    !Number.isFinite(m.t0_unix) ||
    m.t0_unix < 0 ||
    !Number.isSafeInteger(m.duration_us) ||
    m.duration_us < 0
  )
    throw Error("Invalid session clock");
  if (
    m.config?.emg_hz !== 2000 ||
    m.config?.imu_hz !== 100 ||
    m.config?.channels !== 4
  )
    throw Error("Unsupported stream configuration");
  if (
    !Array.isArray(m.channel_map) ||
    m.channel_map.length !== 4 ||
    m.channel_map.some(
      (c, i) => c.id !== `emg_ch${i + 1}` || c.unit !== "adc_count",
    )
  )
    throw Error("Invalid channel map");
  for (const key of Object.keys(HEADERS)) {
    if (!Array.isArray(b[key])) throw Error(`Missing ${key}`);
    let lastT = -1,
      lastI = -1;
    for (const r of b[key]) {
      for (const field of HEADERS[key])
        if (!(field in r) || (numeric.has(field) && !Number.isFinite(r[field])))
          throw Error(`Invalid ${key}.${field}`);
      if (
        !Number.isSafeInteger(r.t_us) ||
        r.t_us < 0 ||
        r.t_us > m.duration_us ||
        (key !== "events" && r.t_us === m.duration_us) ||
        r.t_us < lastT ||
        (["emg", "imu", "predictions"].includes(key) && r.t_us === lastT)
      )
        throw Error(`Invalid ${key} time order`);
      if ("sample_index" in r) {
        if (!Number.isSafeInteger(r.sample_index) || r.sample_index <= lastI)
          throw Error(`Invalid ${key} sequence`);
        lastI = r.sample_index;
      }
      if (key === "emg") {
        for (let c = 1; c <= 4; c++)
          if (
            !Number.isInteger(r[`emg_ch${c}`]) ||
            r[`emg_ch${c}`] < 0 ||
            r[`emg_ch${c}`] > 4095
          )
            throw Error("EMG outside ADC range");
        if (![0, 1, 2, 3].includes(r.adc_flags))
          throw Error("Invalid ADC flags");
      }
      if (
        key === "imu" &&
        (!Number.isInteger(r.sensor_flags) || r.sensor_flags < 0)
      )
        throw Error("Invalid sensor flags");
      if (
        key === "events" &&
        (!CLASSES.includes(r.target_posture) ||
          ![
            "cue",
            "rest",
            "complete",
            "stop",
            "fault_on",
            "fault_off",
          ].includes(r.event_type))
      )
        throw Error("Invalid event");
      if (
        key === "predictions" &&
        (![...CLASSES, "uncertain"].includes(r.predicted_posture) ||
          r.confidence < 0 ||
          r.confidence > 1 ||
          r.latency_ms < 0 ||
          ![0, 1].includes(r.quality_ok))
      )
        throw Error("Invalid prediction");
      lastT = r.t_us;
    }
  }
  return true;
}
export function qualitySummary(rows, hz, durationUs, emg = false) {
  const expected = Math.ceil((durationUs * hz) / 1e6),
    n = rows.length;
  let gaps = 0,
    clipped = 0,
    min = Infinity,
    max = 0;
  for (let i = 0; i < n; i++) {
    if (i) {
      const d = rows[i].t_us - rows[i - 1].t_us;
      min = Math.min(min, d);
      max = Math.max(max, d);
      gaps += Math.max(0, rows[i].sample_index - rows[i - 1].sample_index - 1);
    }
    if (emg)
      for (let c = 1; c <= 4; c++)
        if (rows[i][`emg_ch${c}`] <= 0 || rows[i][`emg_ch${c}`] >= 4095)
          clipped++;
  }
  const loss = expected ? Math.max(0, expected - n) / expected : 0;
  const rate = durationUs ? (n * 1e6) / durationUs : 0;
  return {
    samples: n,
    expected,
    sequence_gaps: gaps,
    missing_fraction: loss,
    received_hz: rate,
    rate_error_fraction: Math.abs(rate / hz - 1),
    clipped_fraction: emg && n ? clipped / (n * 4) : 0,
    min_dt_us: n > 1 ? min : null,
    max_dt_us: n > 1 ? max : null,
  };
}
export function migrateV1(text, meta = {}) {
  const { headers, rows } = parseCSV(text);
  if (headers.join(",") !== V1_HEADER)
    throw Error("V1 header does not match frozen schema");
  if (!rows.length) throw Error("V1 log is empty");
  const b = newSession({
    participant: "LEGACY-UNKNOWN",
    session: "V1-IMPORT",
    now: meta.t0_unix ?? 0,
  });
  b.session.provenance = "legacy_unverified";
  b.session.device_version = "v1-import";
  b.session.firmware_version = "unknown";
  b.session.legacy = {
    t0_known: Number.isFinite(meta.t0_unix),
    reserved_emg: "not raw EMG; excluded",
    source_time_origin: Number(rows[0].t_us),
    rtc_health_preserved: true,
  };
  b.session.legacy_rtc_health = [];
  const origin = Number(rows[0].t_us);
  b.imu = rows.map((r) => {
    if (r.schema_version !== "1") throw Error("Mixed V1 schema");
    const out = { sample_index: Number(r.seq), t_us: Number(r.t_us) - origin };
    for (const [a, z] of [
      ["ax", "ax_g"],
      ["ay", "ay_g"],
      ["az", "az_g"],
      ["gx", "gx_dps"],
      ["gy", "gy_dps"],
      ["gz", "gz_dps"],
    ])
      out[a] = r[z].trim() === "" ? NaN : Number(r[z]);
    out.sensor_flags = 1;
    b.session.legacy_rtc_health.push({
      t_us: out.t_us,
      rtc_health: Number(r.rtc_health),
    });
    return out;
  });
  b.session.duration_us = b.imu.at(-1).t_us + 10000;
  validateBundle(b);
  return b;
}
