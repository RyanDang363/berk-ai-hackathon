// Dashboard frontend — polls the read-only API and re-renders with live feedback.
// @spec DASH-UI-001, DASH-UI-002, DASH-UI-003, DASH-UI-004, DASH-UI-005
// @spec DASH-UI-006 (change-flash), DASH-UI-007 (event toasts), DASH-UI-008 (heartbeat)
"use strict";

const POLL_MS = 1000;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

// --- Diff tracking (live feedback) -------------------------------------------
const prev = {}; // key "type:id" -> serialized record
let firstLoad = true;
const seenPatients = new Set();
const alerting = new Set();
let selected = null; // { kind: "patient" | "nurse" | "doctor" | "equipment", id: string }
let currentState = null;
let selectedKey = "";
let floorPositions = new Map(); // key -> { x, y } in floor viewBox units

// Returns "enter" for brand-new entities, "flash" for changed ones, "" otherwise.
// Records the new value so the next tick can diff against it.
function diffClass(type, id, record) {
  const key = `${type}:${id}`;
  const ser = JSON.stringify(record);
  const had = key in prev;
  const changed = had && prev[key] !== ser;
  prev[key] = ser;
  if (!had && !firstLoad) return "enter";
  if (changed) return "flash";
  return "";
}

const LOW_O2 = 50;
const isLowO2 = (e) => e.type === "oxygen" && e.supply_level != null && e.supply_level < LOW_O2;

function detectToasts(state) {
  const toasts = [];
  for (const p of state.patients || []) {
    if (!seenPatients.has(p.id)) {
      seenPatients.add(p.id);
      if (!firstLoad) toasts.push({ kind: "intake", msg: `New patient: ${p.name || p.id}` });
    }
  }
  for (const e of state.equipment || []) {
    if (isLowO2(e)) {
      if (!alerting.has(e.id) && !firstLoad) {
        toasts.push({ kind: "alert", msg: `Low O₂: ${e.id} at ${e.supply_level}% (${e.location || "—"})` });
      }
      alerting.add(e.id);
    } else {
      alerting.delete(e.id);
    }
  }
  return toasts;
}

function showToast({ kind, msg }) {
  const t = el("div", `toast toast-${kind}`, msg);
  $("toasts").append(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 4500);
}

function pulseHeartbeat() {
  const dot = $("live-dot");
  dot.classList.remove("beat");
  void dot.offsetWidth; // restart the animation
  dot.classList.add("beat");
}

function toggleSelection(kind, id) {
  if (selected && selected.kind === kind && selected.id === id) {
    selected = null;
  } else {
    selected = { kind, id };
  }
  renderDetail();
  syncSelectedCards();
}

function showAlertsDetail() {
  selected = { kind: "alerts", id: "active" };
  renderDetail();
  syncSelectedCards();
}

function closeDetail() {
  selected = null;
  renderDetail();
  syncSelectedCards();
}

function syncSelectedCards() {
  const nextKey = selected ? `${selected.kind}:${selected.id}` : "";
  if (
    nextKey === selectedKey &&
    document.querySelector(".interactive-card.active, .floor-token.active, .kpi-action.active")
  ) return;
  selectedKey = nextKey;
  document.querySelectorAll(".interactive-card, .floor-token, .kpi-action").forEach((node) => {
    const isActive = nextKey && node.dataset.key === nextKey;
    node.classList.toggle("active", !!isActive);
    node.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function detailRows(rows) {
  return rows
    .map(
      ([label, value, tone]) =>
        `<div class="detail-row ${tone ? `tone-${tone}` : ""}"><span class="detail-label">${label}</span><span class="detail-value ${tone ? "detail-badge" : ""}">${value ?? "—"}</span></div>`
    )
    .join("");
}

function detailSection(title, rows) {
  return `<section class="detail-section"><h3>${title}</h3>${detailRows(rows)}</section>`;
}

function activeAlerts(state) {
  return (state.equipment || [])
    .filter(isLowO2)
    .map((item) => ({
      id: item.id,
      issue: "Low oxygen supply",
      location: item.location || "Unknown",
      level: item.supply_level,
      tone: supplyTone(item.supply_level) || "bad",
    }));
}

function supplyTone(level) {
  if (level == null) return "";
  if (level < 30) return "bad";
  if (level < 70) return "warn";
  return "good";
}

function acuityTone(acuity) {
  if (acuity == null) return "";
  if (acuity <= 2) return "bad";
  if (acuity === 3) return "warn";
  return "good";
}

function spo2Tone(spo2) {
  if (spo2 == null) return "";
  if (spo2 < 92) return "bad";
  if (spo2 < 95) return "warn";
  return "good";
}

function hrTone(hr) {
  if (hr == null) return "";
  if (hr < 50 || hr > 120) return "bad";
  if (hr < 60 || hr > 100) return "warn";
  return "good";
}

function renderDetail() {
  const shell = $("detail-shell");
  const panel = $("detail-panel");
  const body = $("detail-body");
  const title = $("detail-title");
  const sub = $("detail-sub");
  const kicker = $("detail-kicker");
  const hasSelection = !!selected && !!currentState;
  shell.classList.toggle("hidden", !hasSelection);
  shell.setAttribute("aria-hidden", hasSelection ? "false" : "true");
  document.body.classList.toggle("detail-open", hasSelection);

  if (!hasSelection) {
    body.replaceChildren();
    return;
  }

  let record = null;
  if (selected.kind === "alerts") {
    record = { id: "active" };
  } else if (selected.kind === "patient") {
    record = (currentState.patients || []).find((p) => p.id === selected.id);
  } else if (selected.kind === "nurse") {
    record = (currentState.nurses || []).find((n) => n.id === selected.id);
  } else if (selected.kind === "doctor") {
    record = (currentState.doctors || []).find((d) => d.id === selected.id);
  } else if (selected.kind === "equipment") {
    record = (currentState.equipment || []).find((e) => e.id === selected.id);
  }

  if (!record) {
    closeDetail();
    return;
  }

  if (selected.kind === "alerts") {
    const alerts = activeAlerts(currentState);
    kicker.textContent = "Alerts";
    title.textContent = `${alerts.length} active ${alerts.length === 1 ? "issue" : "issues"}`;
    sub.textContent = alerts.length ? "Current problems requiring attention" : "No active issues detected";
    body.innerHTML = alerts.length
      ? alerts
          .map((alert) =>
            detailSection(`${alert.issue}: ${alert.id}`, [
              ["Device", alert.id],
              ["Location", alert.location, "bad"],
              ["Current level", `${alert.level}%`, alert.tone],
              ["Action", "Replace or refill oxygen", "bad"],
            ])
          )
          .join("")
      : detailSection("Status", [["System state", "Normal", "good"]]);
  } else if (selected.kind === "patient") {
    const v = record.vitals || {};
    kicker.textContent = "Patient";
    title.textContent = record.name || record.id;
    sub.textContent = `${record.chief_complaint || "No chief complaint"} · ${record.status || "status unknown"}`;
    body.innerHTML =
      detailSection("Status", [
        ["Patient ID", record.id],
        ["Acuity", record.acuity != null ? `ESI ${record.acuity}` : "—", acuityTone(record.acuity)],
        ["Bed", record.assigned_bed || "Unassigned"],
        ["Care team", (record.care_team || []).join(", ") || "—"],
      ]) +
      detailSection("Vitals", [
        ["Heart rate", v.hr ? `${v.hr} bpm` : "—", hrTone(v.hr)],
        ["SpO₂", v.spo2 ? `${v.spo2}%` : "—", spo2Tone(v.spo2)],
        ["Blood pressure", v.bp || "—"],
      ]);
  } else if (selected.kind === "equipment") {
    const level = record.supply_level != null ? `${record.supply_level}%` : "—";
    const inUse = record.in_use_by ? `In use by ${record.in_use_by}` : "Available";
    const useTone = record.in_use_by ? "warn" : "good";
    kicker.textContent = "Device";
    title.textContent = record.id;
    sub.textContent = `${record.type || "equipment"} · ${record.location || "location unknown"}`;
    body.innerHTML =
      detailSection("Status", [
        ["Device ID", record.id],
        ["Type", record.type || "—"],
        ["Location", record.location || "—"],
        ["Use state", inUse, useTone],
      ]) +
      detailSection("Supply", [
        ["Current level", level, supplyTone(record.supply_level)],
        ["Alert threshold", record.type === "oxygen" ? `< ${LOW_O2}%` : "—", record.type === "oxygen" ? "bad" : ""],
      ]);
  } else {
    const role = selected.kind === "nurse" ? "Nurse" : "Doctor";
    kicker.textContent = role;
    title.textContent = record.id;
    sub.textContent = `${record.available ? "Available" : "Busy"}${record.location ? ` · ${record.location}` : ""}`;
    body.innerHTML =
      detailSection("Assignment", [
        ["Role", role.toLowerCase()],
        ["Specialty", record.specialty || "General"],
        ["Location", record.location || "—"],
        ["Availability", record.available ? "Available" : "Busy", record.available ? "good" : "warn"],
      ]) +
      detailSection("Workload", [
        ["Assigned cases", (record.assignments || []).join(", ") || "—"],
        ["Open slots", record.available ? "1+" : "0", record.available ? "good" : "warn"],
      ]);
  }
  panel.scrollTop = 0;
}

// --- Renderers ---------------------------------------------------------------
function renderKpis(s) {
  const kpis = [
    ["Active patients", s.active_patients],
    ["Beds occupied", s.occupied_beds],
    ["Nurses free", s.free_nurses],
    ["Doctors free", s.free_doctors],
    ["Alerts", s.active_alerts],
  ];
  $("kpis").replaceChildren(
    ...kpis.map(([label, val]) => {
      const isAlerts = label === "Alerts";
      const card = el(isAlerts ? "button" : "div", "kpi" + (isAlerts ? " kpi-action" : "") + (isAlerts && val > 0 ? " kpi-alert" : ""));
      if (isAlerts) {
        card.type = "button";
        card.dataset.key = "alerts:active";
        card.onclick = showAlertsDetail;
      }
      card.append(el("div", "kpi-value", String(val ?? 0)), el("div", "kpi-label", label));
      return card;
    })
  );
}

const FLOOR_ZONES = [
  { id: "waiting", label: "Waiting", x: 60, y: 350, w: 220, h: 200 },
  { id: "triage", label: "Triage", x: 760, y: 220, w: 180, h: 165 },
  { id: "trauma", label: "Trauma", x: 760, y: 385, w: 180, h: 165 },
  { id: "nurses-station", label: "Nurse Station", x: 440, y: 360, w: 200, h: 130 },
  { id: "storage", label: "Supply", x: 640, y: 360, w: 120, h: 130 },
  { id: "cardiology", label: "General Bay 1", x: 280, y: 70, w: 160, h: 170 },
  { id: "general-a", label: "General Bay 2", x: 440, y: 70, w: 160, h: 170 },
  { id: "general-b", label: "General Bay 3", x: 600, y: 70, w: 160, h: 170 },
  { id: "corridor", label: "Main Corridor", x: 280, y: 240, w: 480, h: 310 },
];

const FLOOR_VIEWBOX = { w: 1000, h: 620 };

const BED_LAYOUT = {
  bed1: { zone: "cardiology", x: 360, y: 155 },
  bed2: { zone: "general-a", x: 520, y: 155 },
  bed3: { zone: "general-b", x: 680, y: 155 },
  bed4: { zone: "trauma", x: 850, y: 470 },
};

const FLOOR_LABELS = {
  waiting: { x: 76, y: 382 },
  triage: { x: 776, y: 250 },
  trauma: { x: 776, y: 416 },
  "nurses-station": { x: 456, y: 395 },
  storage: { x: 656, y: 395 },
  cardiology: { x: 296, y: 104 },
  "general-a": { x: 456, y: 104 },
  "general-b": { x: 616, y: 104 },
  corridor: { x: 300, y: 288 },
};

const FLOOR_ZONE_ALIASES = {
  supply: "storage",
  "supply-room": "storage",
  "nurse-station": "nurses-station",
  "cardiac-bay": "cardiology",
  "general-bay-1": "cardiology",
  "general-bay-2": "general-a",
  "general-bay-3": "general-b",
  cardiac: "cardiology",
  "general-bay-a": "general-a",
  "general-bay-b": "general-b",
};

function normalizedFloorId(value) {
  const raw = String(value || "corridor").trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
  return FLOOR_ZONE_ALIASES[raw] || raw;
}

function normalizeFloorLocation(value) {
  const normalized = normalizedFloorId(value);
  if (BED_LAYOUT[normalized] || FLOOR_ZONES.some((zone) => zone.id === normalized)) return normalized;
  return "corridor";
}

function normalizeFloorZone(value) {
  const normalized = normalizeFloorLocation(value);
  return BED_LAYOUT[normalized] ? BED_LAYOUT[normalized].zone : normalized;
}

function zoneNameForPatient(patient) {
  if (patient.assigned_bed && BED_LAYOUT[patient.assigned_bed]) return BED_LAYOUT[patient.assigned_bed].zone;
  if (patient.status === "in_triage") return "triage";
  if (patient.status === "waiting") return "waiting";
  return "corridor";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const BED_TOKEN_SLOTS = {
  bed: [{ dx: 0, dy: 0 }],
  patient: [{ dx: 42, dy: -22 }, { dx: 42, dy: 14 }],
  doctor: [{ dx: -46, dy: -14 }, { dx: -14, dy: -46 }, { dx: 14, dy: -46 }],
  nurse: [{ dx: -46, dy: 30 }, { dx: -46, dy: 62 }, { dx: -10, dy: 66 }],
  equipment: [{ dx: 54, dy: 20 }, { dx: 54, dy: 58 }, { dx: 14, dy: 66 }, { dx: -28, dy: 66 }, { dx: -54, dy: 0 }],
};

function overflowSlot(index) {
  const angle = index * 2.399963;
  const radius = 34 + Math.floor(index / 6) * 24;
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius),
  };
}

function positionForBedSlot(bedId, role, index) {
  const bed = BED_LAYOUT[bedId];
  const zone = FLOOR_ZONES.find((z) => z.id === bed.zone);
  const slots = BED_TOKEN_SLOTS[role] || BED_TOKEN_SLOTS.equipment;
  const slot = slots[index] || overflowSlot(index - slots.length + 1);
  return {
    x: clamp(bed.x + slot.dx, zone.x + 28, zone.x + zone.w - 28),
    y: clamp(bed.y + slot.dy, zone.y + 38, zone.y + zone.h - 24),
  };
}

function positionForRoomSlot(roomId, index) {
  const zoneId = normalizeFloorZone(roomId);
  const zone = FLOOR_ZONES.find((z) => z.id === zoneId) || FLOOR_ZONES.find((z) => z.id === "corridor");
  const usableWidth = Math.max(44, zone.w - 56);
  const columns = Math.max(1, Math.min(4, Math.floor(usableWidth / 48)));
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: clamp(zone.x + 34 + col * 48, zone.x + 30, zone.x + zone.w - 30),
    y: clamp(zone.y + 66 + row * 42, zone.y + 48, zone.y + zone.h - 28),
  };
}

function reserveFloorPosition(placements, location, role) {
  const group = normalizeFloorLocation(location);
  if (BED_LAYOUT[group]) {
    const roleKey = `${group}:${role}`;
    const roleIndex = placements.get(roleKey) || 0;
    placements.set(roleKey, roleIndex + 1);
    return positionForBedSlot(group, role, roleIndex);
  }

  const roomIndex = placements.get(group) || 0;
  placements.set(group, roomIndex + 1);
  return positionForRoomSlot(group, roomIndex);
}

function floorPercent(value, axis) {
  const total = axis === "x" ? FLOOR_VIEWBOX.w : FLOOR_VIEWBOX.h;
  return `${(value / total) * 100}%`;
}

function sameFloorPoint(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function floorMarker(kind, id, label, x, y, extraClass = "", title = "", nextPositions = null) {
  const key = `${kind}:${id}`;
  const activeClass = selected && selected.kind === kind && selected.id === id ? " active" : "";
  const previous = floorPositions.get(key);
  const next = { x, y };
  const moved = !firstLoad && previous && !sameFloorPoint(previous, next);
  if (nextPositions) nextPositions.set(key, next);
  const markerTitle = title || `${kind} ${id}`;
  const style = [
    `left:${floorPercent(x, "x")}`,
    `top:${floorPercent(y, "y")}`,
    previous ? `--from-left:${floorPercent(previous.x, "x")}` : "",
    previous ? `--from-top:${floorPercent(previous.y, "y")}` : "",
    `--to-left:${floorPercent(x, "x")}`,
    `--to-top:${floorPercent(y, "y")}`,
  ].filter(Boolean).join(";");
  return `<button type="button" class="floor-token ${kind}${activeClass} ${moved ? "moving" : ""} ${extraClass}" data-key="${escapeAttr(key)}" style="${style}" title="${escapeAttr(markerTitle)}" aria-label="${escapeAttr(markerTitle)}">
    <span class="token-core">${escapeAttr(label)}</span>
    <span class="token-label">${escapeAttr(id)}</span>
  </button>`;
}

function renderBlueprint() {
  const room = (id, fillClass) => {
    const zone = FLOOR_ZONES.find((z) => z.id === id);
    const label = FLOOR_LABELS[id] || { x: zone.x + 16, y: zone.y + 26 };
    return `<g class="bp-room ${fillClass}">
      <rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" />
      <text x="${label.x}" y="${label.y}">${zone.label}</text>
    </g>`;
  };

  const wall = (x1, y1, x2, y2) => `<path class="bp-wall" d="M${x1} ${y1} L${x2} ${y2}" />`;
  const door = (x1, y1, x2, y2, swing = "") => `
    <path class="bp-door-gap" d="M${x1} ${y1} L${x2} ${y2}" />
    ${swing ? `<path class="bp-door-swing" d="${swing}" />` : ""}
  `;

  const bedFixture = (id) => {
    const bed = BED_LAYOUT[id];
    return `<g class="bp-bed-fixture">
      <rect x="${bed.x - 18}" y="${bed.y - 26}" width="36" height="52" rx="10" />
      <rect x="${bed.x - 12}" y="${bed.y - 18}" width="24" height="16" rx="6" />
      <text x="${bed.x}" y="${bed.y + 46}">${id.toUpperCase()}</text>
    </g>`;
  };

  return `
    <svg class="floor-blueprint" viewBox="0 0 1000 620" aria-hidden="true">
      <path class="bp-footprint-shadow" d="M280 70 H760 V220 H940 V550 H60 V350 H280 Z" />
      <path class="bp-footprint" d="M280 70 H760 V220 H940 V550 H60 V350 H280 Z" />
      ${room("corridor", "corridor")}
      ${room("waiting", "soft")}
      ${room("nurses-station", "core")}
      ${room("storage", "support")}
      ${room("triage", "triage")}
      ${room("trauma", "alert")}
      ${room("cardiology", "bay")}
      ${room("general-a", "bay")}
      ${room("general-b", "bay")}

      ${wall(280, 70, 760, 70)}
      ${wall(280, 70, 280, 350)}
      ${wall(760, 70, 760, 220)}
      ${wall(760, 220, 940, 220)}
      ${wall(940, 220, 940, 290)}
      ${wall(940, 345, 940, 430)}
      ${wall(940, 490, 940, 550)}
      ${wall(940, 550, 210, 550)}
      ${wall(140, 550, 60, 550)}
      ${wall(60, 550, 60, 350)}
      ${wall(60, 350, 280, 350)}

      ${wall(440, 70, 440, 240)}
      ${wall(600, 70, 600, 240)}
      ${wall(280, 240, 340, 240)}
      ${wall(380, 240, 500, 240)}
      ${wall(540, 240, 660, 240)}
      ${wall(700, 240, 760, 240)}

      ${wall(280, 350, 280, 425)}
      ${wall(280, 465, 280, 550)}
      ${wall(440, 360, 500, 360)}
      ${wall(560, 360, 690, 360)}
      ${wall(725, 360, 760, 360)}
      ${wall(440, 360, 440, 490)}
      ${wall(440, 490, 640, 490)}
      ${wall(640, 360, 640, 490)}
      ${wall(640, 490, 760, 490)}
      ${wall(760, 220, 760, 285)}
      ${wall(760, 325, 760, 455)}
      ${wall(760, 495, 760, 550)}

      ${wall(760, 385, 940, 385)}

      ${door(340, 240, 380, 240, "M340 240 Q340 268 368 268")}
      ${door(500, 240, 540, 240, "M500 240 Q500 268 528 268")}
      ${door(660, 240, 700, 240, "M660 240 Q660 268 688 268")}
      ${door(500, 360, 560, 360, "M500 360 Q500 328 532 328")}
      ${door(690, 360, 725, 360, "M690 360 Q690 334 716 334")}
      ${door(760, 285, 760, 325, "M760 285 Q732 285 732 313")}
      ${door(760, 455, 760, 495, "M760 455 Q732 455 732 483")}
      ${door(280, 425, 280, 465, "M280 425 Q308 425 308 453")}
      ${door(140, 550, 210, 550)}
      ${door(940, 290, 940, 345)}
      ${door(940, 430, 940, 490)}

      ${bedFixture("bed1")}
      ${bedFixture("bed2")}
      ${bedFixture("bed3")}
      ${bedFixture("bed4")}
      <text class="bp-small bp-exit-label main" x="180" y="610">Main Entrance</text>
      <text class="bp-small bp-exit-label ambulance" x="986" y="318" transform="rotate(90 986 318)">Ambulance Bay</text>
      <text class="bp-small bp-exit-label ambulance" x="986" y="460" transform="rotate(90 986 460)">Ambulance Bay</text>
      <path class="bp-exit-arrow" d="M180 566 V590" />
      <path class="bp-exit-arrow" d="M954 318 H980" />
      <path class="bp-exit-arrow" d="M954 460 H980" />
    </svg>
  `;
}

function renderFloorMap(state) {
  const map = $("floor-map");
  const byId = (a, b) => String(a.id || "").localeCompare(String(b.id || ""));
  const beds = [...(state.beds || [])].sort(byId);
  const patients = [...(state.patients || [])].sort(byId);
  const nurses = [...(state.nurses || [])].sort(byId);
  const doctors = [...(state.doctors || [])].sort(byId);
  const equipment = [...(state.equipment || [])].sort(byId);

  const bedPatient = Object.fromEntries(patients.filter((p) => p.assigned_bed).map((p) => [p.assigned_bed, p]));
  const markers = [];
  const nextFloorPositions = new Map();
  const placements = new Map();

  for (const bed of beds) {
    const pos = reserveFloorPosition(placements, bed.id, "bed");
    markers.push(floorMarker("bed", bed.id, "B", pos.x, pos.y, `status-${bed.status || "available"}`, `${bed.id}: ${bed.status || "available"}`, nextFloorPositions));
    const patient = bedPatient[bed.id];
    if (patient) {
      const patientPos = reserveFloorPosition(placements, patient.assigned_bed, "patient");
      markers.push(floorMarker("patient", patient.id, "P", patientPos.x, patientPos.y, "", `${patient.name || patient.id}: ${patient.status || "patient"}`, nextFloorPositions));
    }
  }

  patients
    .filter((p) => !p.assigned_bed)
    .forEach((patient, index) => {
      const zone = zoneNameForPatient(patient);
      const pos = reserveFloorPosition(placements, zone, "patient");
      markers.push(floorMarker("patient", patient.id, "P", pos.x, pos.y, "", `${patient.name || patient.id}: ${patient.status || "patient"}`, nextFloorPositions));
    });

  nurses.forEach((nurse) => {
    const pos = reserveFloorPosition(placements, nurse.location || "nurses-station", "nurse");
    markers.push(floorMarker("nurse", nurse.id, "N", pos.x, pos.y, nurse.available ? "status-free" : "status-busy", `${nurse.id}: ${nurse.available ? "available" : "busy"}`, nextFloorPositions));
  });

  doctors.forEach((doctor) => {
    const assignedPatient = patients.find((p) => (doctor.assignments || []).includes(p.id));
    const location = assignedPatient && assignedPatient.assigned_bed && BED_LAYOUT[assignedPatient.assigned_bed]
      ? assignedPatient.assigned_bed
      : doctor.location || (doctor.specialty === "cardiology" ? "cardiology" : "nurses-station");
    const pos = reserveFloorPosition(placements, location, "doctor");
    markers.push(floorMarker("doctor", doctor.id, "D", pos.x, pos.y, doctor.available ? "status-free" : "status-busy", `${doctor.id}: ${doctor.available ? "available" : "busy"}`, nextFloorPositions));
  });

  equipment.forEach((item) => {
    let location;
    if (item.location && BED_LAYOUT[item.location]) {
      location = item.location;
    } else if (item.in_use_by) {
      const patient = patients.find((p) => p.id === item.in_use_by);
      location = patient && patient.assigned_bed ? patient.assigned_bed : "storage";
    } else {
      location = item.location || "storage";
    }
    const pos = reserveFloorPosition(placements, location, "equipment");
    const cls = item.type === "oxygen" && item.supply_level != null && item.supply_level < LOW_O2 ? "status-alert" : "";
    const level = item.supply_level != null ? `, ${item.supply_level}%` : "";
    markers.push(floorMarker("equipment", item.id, item.type === "oxygen" ? "O2" : item.type === "defibrillator" ? "DF" : "IV", pos.x, pos.y, cls, `${item.id}: ${item.type}${level}`, nextFloorPositions));
  });

  map.innerHTML = `
    <div class="floor-shell">
      ${renderBlueprint()}
      <div class="floor-hud" aria-hidden="true">
        <span>ER-01</span>
        <span>${patients.filter((p) => p.status !== "discharged").length} patients</span>
        <span>${nurses.length + doctors.length} staff</span>
      </div>
      ${markers.join("")}
      <div class="floor-legend">
        <span><i class="legend-dot patient"></i>Patients</span>
        <span><i class="legend-dot nurse"></i>Nurses</span>
        <span><i class="legend-dot doctor"></i>Doctors</span>
        <span><i class="legend-dot equipment"></i>Devices</span>
      </div>
    </div>
  `;
  floorPositions = nextFloorPositions;

  map.querySelectorAll(".floor-token").forEach((node) => {
    const [kind, id] = node.dataset.key.split(":");
    if (["patient", "nurse", "doctor"].includes(kind)) {
      node.onclick = () => toggleSelection(kind, id);
    } else if (kind === "bed") {
      node.onclick = () => {
        const patient = patients.find((p) => p.assigned_bed === id);
        if (patient) toggleSelection("patient", patient.id);
      };
    } else if (kind === "equipment") {
      node.onclick = () => toggleSelection("equipment", id);
    }
  });
  syncSelectedCards();
}

function renderBeds(beds) {
  const root = $("beds");
  if (!beds.length) return root.replaceChildren(el("p", "empty", "No beds configured."));
  root.replaceChildren(
    ...beds.map((b) => {
      const tile = el("div", `bed bed-${b.status} ${diffClass("bed", b.id, b)}`);
      tile.append(
        el("div", "bed-id", b.id),
        el("div", "bed-status", b.status),
        el("div", "bed-sub", b.occupied_by ? `patient ${b.occupied_by}` : b.specialty || "—")
      );
      return tile;
    })
  );
}

function renderPatients(patients) {
  const root = $("patients");
  const active = patients.filter((p) => p.status !== "discharged");
  if (!active.length) return root.replaceChildren(el("p", "empty", "No patients in the ER."));
  root.replaceChildren(
    ...active.map((p) => {
      const v = p.vitals || {};
      const card = el("button", `card interactive-card ${diffClass("patient", p.id, p)}`);
      card.type = "button";
      card.dataset.key = `patient:${p.id}`;
      card.onclick = () => toggleSelection("patient", p.id);
      card.append(
        el("div", "card-top", `<strong>${p.name || p.id}</strong><span class="pill acuity-${p.acuity}">ESI ${p.acuity ?? "—"}</span>`),
        el("div", "card-line", `${p.chief_complaint || "—"} · ${p.status}`),
        el("div", "card-line muted", `HR ${v.hr ?? "—"} · SpO₂ ${v.spo2 ?? "—"} · BP ${v.bp ?? "—"}`),
        el("div", "card-line muted", `Bed ${p.assigned_bed || "—"} · Team ${(p.care_team || []).join(", ") || "—"}`),
        el("div", "card-hint", "Click for live details")
      );
      return card;
    })
  );
}

function renderStaff(nurses, doctors) {
  const mk = (s, role, type) => {
    const free = s.available;
    const card = el("button", `card interactive-card ${diffClass(type, s.id, s)}`);
    card.type = "button";
    card.dataset.key = `${type}:${s.id}`;
    card.onclick = () => toggleSelection(type, s.id);
    card.append(
      el("div", "card-top", `<strong>${s.id}</strong><span class="pill ${free ? "ok" : "busy"}">${free ? "free" : "busy"}</span>`),
      el("div", "card-line muted", `${role}${s.specialty ? " · " + s.specialty : ""}${s.location ? " · " + s.location : ""}`),
      el("div", "card-line muted", `Assigned: ${(s.assignments || []).join(", ") || "—"}`),
      el("div", "card-hint", "Click for live details")
    );
    return card;
  };
  const cards = [...nurses.map((n) => mk(n, "nurse", "nurse")), ...doctors.map((d) => mk(d, "doctor", "doctor"))];
  $("staff").replaceChildren(...(cards.length ? cards : [el("p", "empty", "No staff on shift.")]));
}

function renderEquipment(equipment) {
  const root = $("equipment");
  if (!equipment.length) return root.replaceChildren(el("p", "empty", "No equipment tracked."));
  root.replaceChildren(
    ...equipment.map((e) => {
      const low = isLowO2(e);
      const card = el("button", `card interactive-card ${low ? "card-alert" : ""} ${diffClass("equipment", e.id, e)}`);
      card.type = "button";
      card.dataset.key = `equipment:${e.id}`;
      card.onclick = () => toggleSelection("equipment", e.id);
      const level = e.supply_level != null ? `${e.supply_level}%` : e.in_use_by ? "in use" : "available";
      card.append(
        el("div", "card-top", `<strong>${e.id}</strong><span class="pill ${low ? "busy" : "ok"}">${level}</span>`),
        el("div", "card-line muted", `${e.type} · ${e.location || "—"}${e.in_use_by ? " · " + e.in_use_by : ""}`),
        el("div", "card-hint", "Click for live details")
      );
      return card;
    })
  );
}

function renderEvents(events) {
  const root = $("events");
  if (!events.length) return root.replaceChildren(el("li", "empty", "No events yet."));
  root.replaceChildren(
    ...[...events].reverse().map((ev) => {
      const li = el("li", `event event-${ev.event}`);
      const chain = ev.from && ev.to ? `${ev.from} → ${ev.to}` : ev.event;
      li.append(
        el("span", "event-ts", ev.ts || ""),
        el("span", "event-chain", chain),
        el("span", "event-detail", ev.detail || "")
      );
      return li;
    })
  );
}

// --- Poll loop ---------------------------------------------------------------
async function tick() {
  try {
    const state = await getJSON("/api/state");
    currentState = state;
    $("banner").classList.toggle("hidden", !state.stale);
    $("updated").textContent = "updated " + (state.generated_at || "");
    pulseHeartbeat();

    const toasts = detectToasts(state);
    renderKpis(state.summary || {});
    renderFloorMap(state);
    renderBeds(state.beds || []);
    renderPatients(state.patients || []);
    renderStaff(state.nurses || [], state.doctors || []);
    renderEquipment(state.equipment || []);
    renderDetail();
    syncSelectedCards();
    toasts.forEach(showToast);
    firstLoad = false;
  } catch (e) {
    $("banner").classList.remove("hidden");
  }
  try {
    const { events } = await getJSON("/api/events");
    renderEvents(events || []);
  } catch (e) {
    /* keep last log on error */
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selected) closeDetail();
});
$("detail-close").onclick = closeDetail;
$("detail-backdrop").onclick = closeDetail;

tick();
setInterval(tick, POLL_MS);
