# LLD — ER Twin Core (Bureau, Orchestrator, Contracts)

**Component:** Core agent system — Bureau wiring, OrchestratorAgent, shared message protocols, and Redis state contracts.
**HLD reference:** [README.md](../../README.md) (the High-Level Design).
**Status:** Draft — awaiting review.
**Scope of this LLD:** the shared vocabulary (message schemas + Redis keys) for the whole core system, plus the design of the first slice (Bureau + Orchestrator skeleton). The 3 demo events are covered at the contract level here; their behavioral requirements are specified in EARS (next phase).

---

## RONGERS Standards Applied

These govern every downstream decision in this LLD and the implementation plan.

- **Python 3.11+**; `uagents` + `uagents-core`. Bureau for all internal agents; Chat Protocol only on the Orchestrator.
- **Package layout:** single `er_twin/` package — `agents/`, `protocols.py`, `storage.py`, `config.py`, `main.py`.
- **Message models:** uAgent `Model` subclasses in shared `protocols.py`, named request/response (`XxxRequest` / `XxxResponse`).
- **State:** Redis hashes keyed `er:{entity}:{id}`, behind a `StorageInterface`; in-memory dict implementation first.
- **Config:** `pydantic-settings` over `.env`; `USE_MOCK` flag for hardcoded Orchestrator responses.
- **Addresses:** deterministic seed-derived addresses set as startup constants — no runtime discovery.
- **Tooling:** `uv`, `ruff`, `pytest`. **TDD** for handlers and event flows.

---

## 1. Module Layout

```
er_twin/
├── __init__.py
├── config.py          # Settings (pydantic-settings): API keys, REDIS_URL, USE_MOCK, AGENT_SEED
├── protocols.py       # ALL uAgent Model message schemas (shared vocabulary)
├── storage.py         # StorageInterface + InMemoryStore + (later) RedisStore
├── addresses.py       # Seed-derived agent address constants, computed at startup
├── agents/
│   ├── __init__.py
│   ├── orchestrator.py   # OrchestratorAgent: mailbox + Chat Protocol + ASI:One reasoning
│   ├── admissions.py     # AdmissionsAgent
│   ├── triage.py         # TriageAgent
│   ├── patient.py        # PatientAgent (pool of N, created at startup, bound at intake)
│   ├── nurse.py          # NurseAgent (xN)
│   ├── doctor.py         # DoctorAgent (xN)
│   ├── bed.py            # BedAgent (xN)
│   └── equipment.py      # EquipmentAgent (xN)
└── main.py            # Builds the Bureau, instantiates agents, bureau.run()
```

---

## 2. Data Models (entity state)

Stored in Redis as one hash per entity. Field types are the canonical in-memory shape; Redis stores stringified values.

### Patient Agent Pool

PatientAgents are **pre-instantiated at Bureau startup** as a fixed idle pool (N = 3 for the demo) — never spawned at runtime, to preserve deterministic addressing and demo reliability (see §7). On intake the Orchestrator/Admissions **binds** an incoming patient to the next idle PatientAgent and hydrates it with the record. The bound agent then "owns" that patient — it holds the `patient_id`, can update its own vitals, and can autonomously emit deterioration events (relevant to Event 2). On discharge the agent returns to `idle` (state overwritten on next bind); the agent itself is never torn down.

A `PatientAgent` has an internal lifecycle field `bound_to: str|null` (the patient id it currently owns, or `null` when idle). The patient's clinical state lives in the Redis hash below.

### Patient
| Field | Type | Notes |
|---|---|---|
| `id` | str | `p1`, `p2`, … |
| `name` | str | synthetic |
| `chief_complaint` | str | free text from intake |
| `acuity` | int | 1 (most urgent) – 5 (least), ESI scale; set by Triage |
| `status` | enum | `waiting` \| `in_triage` \| `admitted` \| `in_treatment` \| `discharged` |
| `vitals` | dict | `{hr, bp, spo2, temp}` |
| `assigned_bed` | str\|null | bed id |
| `care_team` | list[str] | nurse/doctor ids |

### Bed
| Field | Type | Notes |
|---|---|---|
| `id` | str | `bed1`–`bed4` |
| `occupied_by` | str\|null | patient id |
| `status` | enum | `available` \| `occupied` \| `cleaning` |
| `specialty` | str | e.g. `general`, `trauma` |
| `equipment` | list[str] | attached equipment ids |

### Nurse / Doctor
| Field | Type | Notes |
|---|---|---|
| `id` | str | `nurse1`, `doc1`, … |
| `available` | bool | |
| `location` | str | bed/zone id |
| `assignments` | list[str] | patient ids |
| `skills` / `specialty` | list[str] / str | nurse skills / doctor specialty |

### Equipment
| Field | Type | Notes |
|---|---|---|
| `id` | str | `o2_1`, `defib_1`, … |
| `type` | enum | `oxygen` \| `defibrillator` \| `iv_pump` |
| `supply_level` | int\|null | **Per-type:** consumables (`oxygen`) use 0–100%; devices (`defibrillator`, `iv_pump`) leave this `null` and use `in_use_by` for availability. |
| `in_use_by` | str\|null | patient id; the availability signal for devices |
| `location` | str | bed/zone id |

> **Availability is type-dependent.** The `EquipmentAgent` checks `supply_level` for consumables (alert when below threshold) and `in_use_by` for devices (free vs occupied). The demo's only equipment event is the oxygen consumable path.

---

## 3. Contracts — Message Schemas (`protocols.py`)

All are `uagents.Model` subclasses. Own-surface resources (this system defines and consumes them all internally). The Orchestrator is the hub: it receives a parsed intent and fans out request/response pairs to entity agents.

### Chat / ASI:One surface (external-facing, Orchestrator only)
Uses the standard `uagents_core.contrib.protocols.chat` `ChatMessage` / `ChatAcknowledgement`. The Orchestrator translates inbound chat text → internal intent via the ASI:One LLM (or `USE_MOCK` lookup).

### Event 1 — Patient Intake
| Message | Direction | Fields |
|---|---|---|
| `PatientIntakeRequest` | Orch → Admissions | `name: str`, `chief_complaint: str`, `vitals: dict` |
| `PatientIntakeResponse` | Admissions → Orch | `patient_id: str`, `record: dict` |
| `PatientBindRequest` | Orch → PatientAgent | `patient_id: str`, `record: dict` *(bind an idle pooled agent + hydrate it)* |
| `PatientBindResponse` | PatientAgent → Orch | `patient_id: str`, `agent_id: str`, `bound: bool` *(`bound=false` if no idle agent)* |
| `TriageRequest` | Orch → Triage | `patient_id: str`, `chief_complaint: str`, `vitals: dict` |
| `TriageResponse` | Triage → Orch | `patient_id: str`, `acuity: int` |
| `BedAssignRequest` | Orch → Bed | `patient_id: str`, `required_specialty: str` |
| `BedAssignResponse` | Bed → Orch | `patient_id: str`, `bed_id: str\|null`, `success: bool` |
| `StaffAssignRequest` | Orch → Nurse/Doctor | `patient_id: str`, `bed_id: str` |
| `StaffAssignResponse` | Nurse/Doctor → Orch | `patient_id: str`, `staff_id: str`, `accepted: bool` |

### Event 2 — Low Oxygen Alert
| Message | Direction | Fields |
|---|---|---|
| `LowSupplyAlert` | Equipment → Orch | `equipment_id: str`, `type: str`, `supply_level: int`, `location: str` |
| `EquipmentLocateRequest` | Orch → Equipment | `type: str`, `near_location: str` |
| `EquipmentLocateResponse` | Equipment → Orch | `equipment_id: str\|null`, `location: str`, `available: bool` |
| `StaffDispatchRequest` | Orch → Nurse | `task: str`, `target_location: str`, `equipment_id: str` |
| `StaffDispatchResponse` | Nurse → Orch | `staff_id: str`, `accepted: bool`, `eta_note: str` |

### Event 3 — Status Summary
| Message | Direction | Fields |
|---|---|---|
| `StateQueryRequest` | Orch → (any agent) | `entity_type: str` |
| `StateQueryResponse` | agent → Orch | `entity_type: str`, `entities: list[dict]` |

> Note: Status Summary may also read directly from the store (faster, fewer messages). `StateQuery*` exists for the agent-to-agent path; the Orchestrator decides per `USE_MOCK`/performance.

### First-slice skeleton message
| Message | Direction | Fields |
|---|---|---|
| `PingRequest` | Orch → Stub | `text: str` |
| `PingResponse` | Stub → Orch | `text: str`, `agent_id: str` |

---

## 4. Contracts — Redis Key Schema

| Key pattern | Type | Holds | Written by |
|---|---|---|---|
| `er:patient:{id}` | hash | Patient state (§2) | Admissions, Triage, Orch |
| `er:bed:{id}` | hash | Bed state | Bed |
| `er:nurse:{id}` | hash | Nurse state | Nurse |
| `er:doctor:{id}` | hash | Doctor state | Doctor |
| `er:equipment:{id}` | hash | Equipment state | Equipment |
| `er:index:{entity}` | set | all ids of an entity type (e.g. `er:index:patient`) | each agent on init |
| `er:events` | pub/sub channel | JSON event log lines (stretch dashboard feed) | Orchestrator |

`StorageInterface` methods: `get(key) -> dict`, `set(key, dict)`, `update(key, partial_dict)`, `list_ids(entity) -> list[str]`, `publish(channel, msg)`. `InMemoryStore` implements all; `RedisStore` swaps in later with zero handler changes.

---

## 5. Control Flow — First Slice (Bureau + Orchestrator skeleton)

1. `main.py` loads `Settings`, computes seed-derived addresses into `addresses.py` constants.
2. Instantiate `OrchestratorAgent` (mailbox=True, includes `chat_proto`) and one `StubAgent`.
3. `bureau.add(...)` both; `bureau.run()`.
4. Inbound `ChatMessage` → Orchestrator handler → (LLM or `USE_MOCK`) parses intent → sends `PingRequest` to stub address → stub replies `PingResponse` → Orchestrator returns `ChatMessage` ack/text to the user.

This proves: registration, in-process messaging, deterministic addressing, and the `USE_MOCK` path — the whole interaction loop in miniature.

---

## 6. Error Handling

- Every `ctx.send` wrapped; failures logged via `ctx.logger` and surfaced to the chat as a graceful message, never a crash.
- Orchestrator LLM call has a timeout; on timeout/rate-limit/error → fall back to `USE_MOCK` response so the demo never stalls.
- Bed/staff assignment requests that cannot be satisfied return `success=false`/`accepted=false` (not exceptions); Orchestrator reports "no bed available" to chat.
- Unknown intent from the LLM → Orchestrator returns a clarifying chat message.
- **Idempotency:** state-mutating handlers are no-ops on duplicate input. A second `BedAssignRequest` for a patient already in that bed returns the existing assignment with `success=true` and writes nothing new; a duplicate intake for an already-active patient returns the existing `patient_id` rather than creating a second record (dedupe key: `name` + `chief_complaint` among non-discharged patients).
- **Concurrency:** the Orchestrator serializes inbound chat commands — one command is fully processed (intent → fan-out → reply) before the next begins. No concurrent command handling in the demo.

---

## 7. Decisions & Alternatives

| Decision | Chosen | Alternative considered | Why |
|---|---|---|---|
| State access for Status Summary | Read store directly in Orchestrator | `StateQuery` round-trip to every agent | Fewer messages, faster, demo-safe; query path kept for purity but optional |
| Message style | Request/response `Model` pairs | Past-tense event broadcasts | Orchestrator-hub topology maps cleanly to req/resp; easier to trace and test |
| Equipment alert | Push (`LowSupplyAlert` Equipment→Orch) | Orchestrator polls supply levels | Push matches "agents act" thesis and the demo trigger phrasing |
| Address resolution | Seed-derived constants at startup | Almanac/runtime discovery | Deterministic, no network, demo-reliable (per spec risk mitigation) |
| Patient as agent | Pre-instantiated **pool** of N PatientAgents, bound at intake | (a) record-only, no live agent; (b) dynamic spawn per intake | Pool keeps real PatientAgents (autonomous deterioration for Event 2) while preserving deterministic addressing and demo stability. Dynamic spawn is fragile: runtime Bureau mutation isn't a supported lifecycle, breaks startup-constant addressing, opens a dropped-message timing window, and complicates teardown. |

---

## 8. Edge Case Resolutions

Resolved with the user before writing EARS. These become explicit specs (incl. idempotency) in the next phase.

| # | Edge case | Resolution |
| --- | --- | --- |
| 1 | No bed available on intake | Leave patient in `waiting`, report to chat. **No auto-retry** when a bed later frees. |
| 2 | No staff accepts assignment | Same — patient stays assigned-to-bed but unstaffed; chat reports "no staff available." No auto-retry. |
| 3 | Duplicate intake | **No-op / dedupe.** Return the existing `patient_id` for an already-active (non-discharged) patient matching `name` + `chief_complaint`; do not create a second record. |
| 4 | Low-oxygen alert, no replacement unit | Report to chat ("no available O₂ unit near {location}"). Do not dispatch a unit that is itself below threshold. |
| 5 | Bed specialty mismatch | Fall back to a `general` bed when no specialty match exists; only report failure if none available at all. |
| 6 | Idempotency of state writes | **No-op on duplicate.** Re-applying the same `BedAssignRequest`/`StaffAssignRequest` returns the existing assignment with `success=true` and writes nothing new. |
| 7 | Equipment supply semantics | **Per-type** — consumables (`oxygen`) use `supply_level` 0–100; devices use `in_use_by`. See §2. |
| 8 | Status Summary with empty ER | Return a graceful "nothing currently happening in the ER" summary, not an error. |
| 9 | Concurrent chat commands | **Serialize** in the Orchestrator — one command fully processed before the next. See §6. |
| 10 | Malformed/partial ASI:One intent | Fall back to `USE_MOCK`/clarifying message (see §6); log the raw LLM output via `ctx.logger` for debugging. |

---

*Next phase after approval: EARS specs for the 3 events in `docs/specs/`, then the implementation plan in `docs/plans/`.*
