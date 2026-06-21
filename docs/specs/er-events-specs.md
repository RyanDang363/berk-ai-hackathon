# EARS Specs — ER Twin Core Events

**Traces to:** [LLD — ER Twin Core](../llds/er-twin-core.lld.md) → [README (HLD)](../../README.md)
**Status markers:** `[ ]` active gap (not yet implemented) · `[x]` implemented · `[D]` deferred

Spec ID format: `{FEATURE}-{TYPE}-{NNN}`. Features: `ORCH` (orchestrator/chat/system), `INTAKE` (Event 1), `OXY` (Event 2), `SUMM` (Event 3), `MEM` (Iris agent memory — Phase 7), `EHR` (master EHR + intake loader), `DOMAIN` (cross-cutting invariants). Types: `CHAT`, `LLM`, `SYS`, `SKEL`, `FLOW`, `BIND`, `ERR`, `IDEM`, `STATE`.

---

## ORCH — Orchestrator, Chat & System Foundation (first slice)

- [ ] **ORCH-CHAT-001** — When the system starts, the OrchestratorAgent shall register with a mailbox and include the Chat Protocol, making it reachable from ASI:One.
- [ ] **ORCH-CHAT-002** — When the OrchestratorAgent receives a `ChatMessage`, it shall return a `ChatAcknowledgement` and a `ChatMessage` reply to the sender.
- [ ] **ORCH-SYS-001** — The system shall run all non-orchestrator agents as local agents inside a single uAgents Bureau process. *(ubiquitous invariant)*
- [x] **ORCH-SYS-002** — When the system starts, it shall compute each agent's address from its deterministic seed and expose those addresses as startup constants. *(no runtime discovery)*
- [ ] **ORCH-SYS-003** — While a chat command is being processed, the OrchestratorAgent shall defer any newly received chat command until the current one has produced a reply. *(serialization — LLD §6)*
- [ ] **ORCH-LLM-001** — When the OrchestratorAgent receives a natural-language command, it shall call the ASI:One LLM to resolve the command into a structured intent identifying the target event.
- [ ] **ORCH-LLM-002** — If the ASI:One call times out, is rate-limited, or errors, then the OrchestratorAgent shall return a hardcoded fallback response and continue without crashing.
- [ ] **ORCH-LLM-003** — Where `USE_MOCK` is enabled, the OrchestratorAgent shall resolve intents from a hardcoded lookup instead of calling the ASI:One LLM.
- [ ] **ORCH-LLM-004** — If the resolved intent matches no known event, then the OrchestratorAgent shall return a clarifying chat message and shall not dispatch any agent messages.
- [ ] **ORCH-SKEL-001** — When the OrchestratorAgent resolves a ping intent, it shall send a `PingRequest` to the stub agent and return the stub's `PingResponse` text to the chat sender. *(first-slice proof of the loop)*

---

## INTAKE — Event 1: Patient Intake

Trigger: *"A new patient arrived with chest pain"*

- [ ] **INTAKE-FLOW-001** — When the OrchestratorAgent resolves a patient-intake intent, it shall send a `PatientIntakeRequest` to the AdmissionsAgent containing the patient name, chief complaint, vitals, and MRN (extracted from chat if spoken; empty string if the patient mentioned no MRN).
- [ ] **INTAKE-FLOW-002** — When the AdmissionsAgent receives a `PatientIntakeRequest` for a new patient, it shall build the EHR-enriched record via `build_live_record(mrn, name, chief_complaint, vitals)`, assign a `patient_id`, set `status="waiting"`, persist the full record to `er:patient:{id}`, and return a `PatientIntakeResponse` with the assigned `patient_id`.
- [ ] **INTAKE-BIND-001** — When the OrchestratorAgent receives a `PatientIntakeResponse` for a new patient, it shall send a `PatientBindRequest` to bind an idle pooled PatientAgent and hydrate it with the record.
- [ ] **INTAKE-BIND-002** — When an idle PatientAgent receives a `PatientBindRequest`, it shall set its `bound_to` to the patient id, load the record, and return a `PatientBindResponse` with `bound=true`.
- [ ] **INTAKE-BIND-003** — If no PatientAgent is idle when a `PatientBindRequest` is needed, then the OrchestratorAgent shall leave the patient record in `waiting`, report "patient capacity reached" to the chat, and not proceed to triage.
- [ ] **INTAKE-FLOW-003** — When a patient has been bound to a PatientAgent, the OrchestratorAgent shall send a `TriageRequest` to the TriageAgent for that patient.
- [ ] **INTAKE-FLOW-004** — When the TriageAgent receives a `TriageRequest`, it shall assign an acuity level between 1 and 5, persist it to the patient record, and return a `TriageResponse`.
- [ ] **INTAKE-FLOW-005** — When the OrchestratorAgent receives a `TriageResponse`, it shall send a `BedAssignRequest` to the BedAgent for the patient's required specialty.
- [ ] **INTAKE-FLOW-006** — When the BedAgent receives a `BedAssignRequest` and a matching-specialty bed is available, it shall mark that bed `occupied`, record `occupied_by`, and return a `BedAssignResponse` with `success=true` and the `bed_id`.
- [ ] **INTAKE-FLOW-007** — When a bed is successfully assigned, the OrchestratorAgent shall send a `StaffAssignRequest` to an available NurseAgent for that patient and bed.
- [ ] **INTAKE-FLOW-008** — When a NurseAgent accepts a `StaffAssignRequest`, it shall set itself unavailable, add the patient to its assignments, and return a `StaffAssignResponse` with `accepted=true`.
- [ ] **INTAKE-FLOW-010** — When a patient's acuity is 2 or lower (more urgent), the OrchestratorAgent shall also send a `StaffAssignRequest` to an available DoctorAgent for that patient and bed.
- [ ] **INTAKE-FLOW-011** — When a DoctorAgent accepts a `StaffAssignRequest`, it shall increment its patient load, add the patient to its assignments, and return a `StaffAssignResponse` with `accepted=true`.
- [ ] **INTAKE-FLOW-009** — When intake completes, the OrchestratorAgent shall return a chat confirmation naming the patient, assigned bed, and the assigned care team (nurse, and doctor when one was paged).
- [ ] **INTAKE-STATE-001** — When a patient is admitted to a bed, the system shall set the patient record status to `admitted`. *(state-driven outcome)*
- [ ] **INTAKE-STATE-002** — The system shall represent patient acuity as an integer from 1 (most urgent) to 5 (least urgent). *(ubiquitous invariant — ESI scale)*
- [ ] **INTAKE-ERR-001** — If no bed matching the required specialty is available, then the BedAgent shall attempt to assign a `general` bed before reporting failure.
- [ ] **INTAKE-ERR-002** — If no bed is available at all, then the patient record shall remain in status `waiting` and the OrchestratorAgent shall report "no bed available" to the chat, without retrying.
- [ ] **INTAKE-ERR-003** — If no NurseAgent accepts the assignment, then the patient shall remain assigned to the bed but unstaffed, and the OrchestratorAgent shall report "no staff available" to the chat, without retrying.
- [ ] **INTAKE-ERR-004** — If acuity is 2 or lower and no DoctorAgent is available, then the OrchestratorAgent shall complete intake with the nurse only and note "no doctor available" in the chat confirmation, without retrying.
- [ ] **INTAKE-IDEM-001** — If a `PatientIntakeRequest` carries an MRN that matches an existing non-discharged patient (via `find_active_patient_by_mrn`), then the AdmissionsAgent shall return the existing `patient_id` and shall not create a second record. When no MRN is present, dedupe falls back to matching by `name`+`chief_complaint` among non-discharged patients.
- [ ] **INTAKE-IDEM-002** — If a `BedAssignRequest` or `StaffAssignRequest` targets a patient already assigned to that bed or staff member, then the receiving agent shall return the existing assignment with `success`/`accepted=true` and shall not write new state.

---

## OXY — Event 2: Low Oxygen Alert

Trigger: *"Bed 3's patient oxygen is dropping"*

- [ ] **OXY-FLOW-001** — When an oxygen EquipmentAgent's `supply_level` falls below the low threshold, it shall emit a `LowSupplyAlert` to the OrchestratorAgent with its id, type, level, and location.
- [ ] **OXY-FLOW-002** — When the OrchestratorAgent receives a `LowSupplyAlert`, it shall send an `EquipmentLocateRequest` for a replacement unit of the same type near the alert location.
- [ ] **OXY-FLOW-003** — When an EquipmentAgent of the requested type is available near the location, it shall return an `EquipmentLocateResponse` with `available=true` and its id and location.
- [ ] **OXY-FLOW-004** — When a replacement unit is located, the OrchestratorAgent shall send a `StaffDispatchRequest` to a NurseAgent to bring the unit to the target location.
- [ ] **OXY-FLOW-005** — When a NurseAgent accepts a `StaffDispatchRequest`, it shall return a `StaffDispatchResponse` with `accepted=true`, and the system shall update the patient and equipment state in Redis.
- [ ] **OXY-FLOW-006** — When the dispatch is confirmed, the OrchestratorAgent shall return a chat status confirmation describing the unit, the dispatched nurse, and the target bed.
- [ ] **OXY-ERR-001** — If no replacement unit of the requested type is available near the location, then the OrchestratorAgent shall report "no available unit" to the chat and shall not dispatch a unit whose own `supply_level` is below the low threshold.
- [ ] **OXY-IDEM-001** — If a `LowSupplyAlert` is received for an equipment id that already has an in-flight dispatch, then the OrchestratorAgent shall not initiate a second dispatch for it.

---

## SUMM — Event 3: Status Summary

Trigger: *"Show me what's happening in the ER"*

- [ ] **SUMM-FLOW-001** — When the OrchestratorAgent resolves a status-summary intent, it shall read the current state of all patients, beds, nurses, doctors, and equipment from the store.
- [ ] **SUMM-FLOW-002** — When the state has been read, the OrchestratorAgent shall synthesize a natural-language summary via the ASI:One LLM and return it to the chat.
- [ ] **SUMM-ERR-001** — If the ER has no active patients and no occupied beds, then the OrchestratorAgent shall return a "nothing currently happening in the ER" summary rather than an error.
- [ ] **SUMM-STATE-001** — When producing a summary, the OrchestratorAgent shall not mutate any entity state. *(read-only invariant)*

---

## MEM — Agent Memory (Orchestrator, Iris — Phase 7)

- [x] **MEM-FLOW-001** — When the OrchestratorAgent completes any ER event (intake, alert, summary), it shall append a session event to the Iris memory store describing the outcome.
- [x] **MEM-FLOW-002** — When the OrchestratorAgent resolves a status-summary intent, it shall query long-term memory for relevant prior events and include recalled facts in its LLM prompt context.
- [x] **MEM-ERR-001** — If `AGENT_MEMORY_*` environment variables are absent or `USE_MOCK` is enabled, then the system shall use `NoopMemory` and shall not call the Iris API.
- [D] **MEM-IDEM-001** — If `record_event` is called with the same text within the same session, the system shall still append it (session event log is append-only); downstream deduplication is Iris's concern.

---

## EHR — Master EHR + Intake Loader

- [ ] **EHR-FLOW-001** — When the OrchestratorAgent resolves a patient-intake intent and the chat contains an MRN, it shall include that MRN in `PatientIntakeRequest.mrn`; when no MRN is present in the chat, it shall send an empty string and the system shall mint the next sequential MRN at record-build time via `next_mrn()`.
- [ ] **EHR-FLOW-002** — When the AdmissionsAgent receives a `PatientIntakeRequest`, it shall call `build_live_record(mrn, name, chief_complaint, vitals)` to produce the EHR-enriched record before persisting, so that a returning patient's history (medications, conditions, allergies) is loaded into the live `er:patient:{id}` hash at admission time.
- [x] **EHR-FLOW-003** — When a patient's MRN is present in the master EHR, `build_live_record` shall populate `record["history"]` with `{medications, conditions, allergies}` and set `record["new_patient"] = False`.
- [x] **EHR-FLOW-004** — When a patient's MRN is absent from the master EHR, `build_live_record` shall set `record["history"]` to `{medications: [], conditions: [], allergies: []}`, set `record["new_patient"] = True`, and write a stub entry back to the master EHR file (writeback).
- [x] **EHR-FLOW-005** — When `PatientIntakeRequest.mrn` is empty, `build_live_record` shall mint the next sequential MRN via `next_mrn()` before the lookup, so every admitted patient has a stable chart identity even if they walked in unregistered.
- [x] **EHR-IDEM-001** — If `register_new_patient` is called with an MRN that already exists in the master EHR, it shall return the existing entry and shall not create a duplicate entry or overwrite existing data.
- [x] **EHR-IDEM-002** — After `register_new_patient` writes to the master EHR file, `get_ehr_record` called within the same process shall return the newly written entry (cache coherence — the writeback must refresh the in-process cache).
- [x] **EHR-ERR-001** — If the master EHR file (`fixtures/ehr_master.json`) is missing or unreadable at intake time, `build_live_record` shall treat every patient as new (empty history, `new_patient=True`) and shall not raise an exception.

---

## DOMAIN — Ubiquitous Invariants

Confirmed domain constraints (DK1–DK3). Enforced by the relevant agents and asserted in tests.

- [ ] **DOMAIN-STATE-001** — The system shall not allow a bed to be occupied by more than one patient at a time. *(DK1)*
- [ ] **DOMAIN-STATE-002** — The system shall not allow a patient to be assigned to more than one bed at a time. *(DK2)*
- [ ] **DOMAIN-STATE-003** — If a patient's status is `discharged`, then the system shall not triage that patient without a new intake. *(DK3)* A discharged patient re-admitted under the same MRN is a new visit (new `patient_id`) with the same chart reloaded — not a reactivation of the old visit record.

---

## Consistency Report

**Coverage:** every message contract in LLD §3 and every Event flow in README §Events has ≥1 spec. The first-slice skeleton (LLD §5) is covered by `ORCH-SKEL-001` + `ORCH-SYS-*`.

**Idempotency:** state-mutating flows carry sibling `IDEM` specs — intake (`INTAKE-IDEM-001`), oxygen dispatch (`OXY-IDEM-001`), and bed/staff assignment (covered by LLD §6, see open question Q3 below).

**Resolved decisions (2026-06-20):**

- **Patient intake model → Pooled PatientAgents.** PatientAgents are pre-instantiated at startup; intake binds an idle one (`INTAKE-BIND-001/002`, capacity error `INTAKE-BIND-003`). See LLD §2 Patient Agent Pool + §7.
- **Q1 → A.** Acuity range pinned as ubiquitous invariant `INTAKE-STATE-002`.
- **Q2 → B.** High-acuity (≤ 2) intake also pages a doctor: `INTAKE-FLOW-010/011`, error `INTAKE-ERR-004`.
- **Q3 → A.** Assignment idempotency made explicit: `INTAKE-IDEM-002`.
- **DK1–DK3 → all confirmed.** Captured as `DOMAIN-STATE-001/002/003`.

---

*Next phase after approval: implementation plan in `docs/plans/`.*
