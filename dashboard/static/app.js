// Dashboard frontend — polls the read-only API and re-renders.
// @spec DASH-UI-001, DASH-UI-002, DASH-UI-003, DASH-UI-004, DASH-UI-005
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

function renderKpis(s) {
  const kpis = [
    ["Active patients", s.active_patients],
    ["Beds occupied", s.occupied_beds],
    ["Nurses free", s.free_nurses],
    ["Doctors free", s.free_doctors],
    ["Alerts", s.active_alerts],
  ];
  const root = $("kpis");
  root.replaceChildren(
    ...kpis.map(([label, val]) => {
      const card = el("div", "kpi" + (label === "Alerts" && val > 0 ? " kpi-alert" : ""));
      card.append(el("div", "kpi-value", String(val ?? 0)), el("div", "kpi-label", label));
      return card;
    })
  );
}

function renderBeds(beds) {
  const root = $("beds");
  if (!beds.length) return root.replaceChildren(el("p", "empty", "No beds configured."));
  root.replaceChildren(
    ...beds.map((b) => {
      const tile = el("div", `bed bed-${b.status}`);
      tile.append(
        el("div", "bed-id", b.id),
        el("div", "bed-status", b.status),
        el("div", "bed-sub", b.occupied_by ? `patient ${b.occupied_by}` : (b.specialty || "—"))
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
      const card = el("div", "card");
      card.append(
        el("div", "card-top", `<strong>${p.name || p.id}</strong><span class="pill acuity-${p.acuity}">ESI ${p.acuity ?? "—"}</span>`),
        el("div", "card-line", `${p.chief_complaint || "—"} · ${p.status}`),
        el("div", "card-line muted", `HR ${v.hr ?? "—"} · SpO₂ ${v.spo2 ?? "—"} · BP ${v.bp ?? "—"}`),
        el("div", "card-line muted", `Bed ${p.assigned_bed || "—"} · Team ${(p.care_team || []).join(", ") || "—"}`)
      );
      return card;
    })
  );
}

function renderStaff(nurses, doctors) {
  const root = $("staff");
  const mk = (s, role) => {
    const card = el("div", "card");
    const free = s.available;
    card.append(
      el("div", "card-top", `<strong>${s.id}</strong><span class="pill ${free ? "ok" : "busy"}">${free ? "free" : "busy"}</span>`),
      el("div", "card-line muted", `${role}${s.specialty ? " · " + s.specialty : ""}${s.location ? " · " + s.location : ""}`),
      el("div", "card-line muted", `Assigned: ${(s.assignments || []).join(", ") || "—"}`)
    );
    return card;
  };
  const cards = [...nurses.map((n) => mk(n, "nurse")), ...doctors.map((d) => mk(d, "doctor"))];
  root.replaceChildren(...(cards.length ? cards : [el("p", "empty", "No staff on shift.")]));
}

function renderEquipment(equipment) {
  const root = $("equipment");
  if (!equipment.length) return root.replaceChildren(el("p", "empty", "No equipment tracked."));
  root.replaceChildren(
    ...equipment.map((e) => {
      const low = e.type === "oxygen" && e.supply_level != null && e.supply_level < 50;
      const card = el("div", "card" + (low ? " card-alert" : ""));
      const level = e.supply_level != null ? `${e.supply_level}%` : (e.in_use_by ? "in use" : "available");
      card.append(
        el("div", "card-top", `<strong>${e.id}</strong><span class="pill ${low ? "busy" : "ok"}">${level}</span>`),
        el("div", "card-line muted", `${e.type} · ${e.location || "—"}${e.in_use_by ? " · " + e.in_use_by : ""}`)
      );
      return card;
    })
  );
}

function renderEvents(events) {
  const root = $("events");
  if (!events.length) return root.replaceChildren(el("li", "empty", "No events yet."));
  // newest first
  root.replaceChildren(
    ...[...events].reverse().map((ev) => {
      const li = el("li", `event event-${ev.event}`);
      li.append(el("span", "event-ts", ev.ts || ""), el("span", "event-detail", ev.detail || ""));
      return li;
    })
  );
}

async function tick() {
  try {
    const state = await getJSON("/api/state");
    $("banner").classList.toggle("hidden", !state.stale);
    $("updated").textContent = "updated " + (state.generated_at || "");
    renderKpis(state.summary || {});
    renderBeds(state.beds || []);
    renderPatients(state.patients || []);
    renderStaff(state.nurses || [], state.doctors || []);
    renderEquipment(state.equipment || []);
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

tick();
setInterval(tick, POLL_MS);
