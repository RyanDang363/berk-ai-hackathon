# Implementation Plan — ER Twin Core (2026-06-20)

**Traces to:** [EARS specs](../specs/er-events-specs.md) · [LLD](../llds/er-twin-core.lld.md) · [README/HLD](../../README.md)
**Scope:** the full core system — Bureau + Orchestrator skeleton first, then the 3 demo events.
**Working agreement:** spec-driven + **TDD**. For each behavioral spec: write a failing `pytest` test tagged `# @spec <ID>`, implement to green, refactor. Annotate handlers with `# @spec <ID>`.

---

## Pattern Grounding

No prior code exists (greenfield). Conventions come from the **RONGERS Standards** in [LLD §RONGERS Standards Applied](../llds/er-twin-core.lld.md#rongers-standards-applied) — mirror those rather than inventing new ones:

| Category | Source pattern |
|---|---|
| Package / module layout | LLD §1 (`er_twin/` single package) |
| Message schemas | LLD §3 — `uagents.Model` request/response pairs in `protocols.py` |
| State access | LLD §4 — `StorageInterface`, `er:{entity}:{id}` keys; in-memory first |
| Config | `pydantic-settings` (`config.py`), `USE_MOCK` flag |
| Addressing | LLD §5 — seed-derived constants in `addresses.py` |
| Errors | LLD §6 — wrap `ctx.send`, graceful chat messages, LLM fallback |
| Tests | `pytest`, `# @spec` annotations, TDD |

---

## Phase 0 — Scaffold & Contracts

**Deliverable:** installable package, settings, storage interface, all message models, address constants. No behavior yet.

| File | Action | Reason |
|---|---|---|
| `pyproject.toml` | CREATE | uv project; deps: `uagents`, `uagents-core`, `pydantic-settings`, `redis`, `pytest`, `ruff` |
| `.env.example` | CREATE | Keys: `ASIONE_API_KEY`, `REDIS_URL`, `FAL_KEY`, `AGENT_SEED`, `USE_MOCK` |
| `er_twin/config.py` | CREATE | `Settings` via pydantic-settings |
| `er_twin/protocols.py` | CREATE | All `Model` classes from LLD §3 (incl. `PatientBind*`, `Ping*`) |
| `er_twin/storage.py` | CREATE | `StorageInterface` + `InMemoryStore` |
| `er_twin/addresses.py` | CREATE | seed-derived address constants |
| `tests/test_storage.py` | CREATE | TDD for `InMemoryStore` get/set/update/list_ids |

- [ ] Phase 0 complete
- **Validation:** `uv run ruff check . && uv run pytest tests/test_storage.py`

---

## Phase 1 — Bureau + Orchestrator Skeleton (FIRST SLICE)

**Specs:** `ORCH-CHAT-001/002`, `ORCH-SYS-001/002/003`, `ORCH-LLM-001/002/003/004`, `ORCH-SKEL-001`
**Deliverable:** Bureau runs; Orchestrator registered (mailbox + Chat Protocol); a chat ping round-trips through a stub agent; `USE_MOCK` path works.

| File | Action | Reason |
|---|---|---|
| `er_twin/agents/orchestrator.py` | CREATE | mailbox + `chat_proto`; intent resolution (ASI:One or `USE_MOCK`); serialization; ping dispatch |
| `er_twin/agents/stub.py` | CREATE | minimal agent handling `PingRequest`→`PingResponse` |
| `er_twin/main.py` | CREATE | build Bureau, add orchestrator + stub, `bureau.run()` |
| `tests/test_orchestrator_skeleton.py` | CREATE | `# @spec ORCH-SKEL-001`, `ORCH-LLM-002/003/004`, `ORCH-SYS-003` |

- [ ] Phase 1 complete (**= first-slice Definition of Done in STATUS.md**)
- **Validation:** `uv run pytest tests/test_orchestrator_skeleton.py` + manual: run `main.py`, send a chat ping, observe stub reply.

---

## Phase 2 — Entity Agents & State

**Specs:** `ORCH-SYS-001`, `DOMAIN-STATE-001/002/003` (guards live in these agents)
**Deliverable:** Patient pool, Bed, Nurse, Doctor, Equipment agents with state read/write; domain invariants enforced.

| File | Action | Reason |
|---|---|---|
| `er_twin/agents/patient.py` | CREATE | pool of N; `bound_to`; `PatientBindRequest` handler |
| `er_twin/agents/bed.py` | CREATE | assignment/release; DOMAIN-STATE-001 guard |
| `er_twin/agents/nurse.py` | CREATE | availability, assignments |
| `er_twin/agents/doctor.py` | CREATE | specialty, load |
| `er_twin/agents/equipment.py` | CREATE | per-type supply/in-use; low-supply check |
| `er_twin/main.py` | UPDATE | instantiate pool + all entity agents |
| `tests/test_domain_invariants.py` | CREATE | `# @spec DOMAIN-STATE-001/002/003` |
| `tests/test_patient_pool.py` | CREATE | `# @spec INTAKE-BIND-002/003` |

- [ ] Phase 2 complete
- **Validation:** `uv run pytest tests/test_domain_invariants.py tests/test_patient_pool.py`

---

## Phase 3 — Event 1: Patient Intake

**Specs:** `INTAKE-FLOW-001..011`, `INTAKE-BIND-001..003`, `INTAKE-STATE-001/002`, `INTAKE-ERR-001..004`, `INTAKE-IDEM-001/002`

| File | Action | Reason |
|---|---|---|
| `er_twin/agents/admissions.py` | CREATE | intake record + dedupe (`INTAKE-IDEM-001`) |
| `er_twin/agents/triage.py` | CREATE | acuity scoring (`INTAKE-FLOW-004`, `INTAKE-STATE-002`) |
| `er_twin/agents/orchestrator.py` | UPDATE | intake orchestration incl. doctor page (`INTAKE-FLOW-010`) |
| `er_twin/agents/{bed,nurse,doctor}.py` | UPDATE | assignment handlers + idempotency (`INTAKE-IDEM-002`) |
| `tests/test_event_intake.py` | CREATE | full flow + all ERR/IDEM specs |

- [ ] Phase 3 complete
- **Validation:** `uv run pytest tests/test_event_intake.py` + manual: chat *"A new patient arrived with chest pain"* → confirmation names bed, nurse, doctor.

---

## Phase 4 — Event 2: Low Oxygen Alert

**Specs:** `OXY-FLOW-001..006`, `OXY-ERR-001`, `OXY-IDEM-001`

| File | Action | Reason |
|---|---|---|
| `er_twin/agents/equipment.py` | UPDATE | emit `LowSupplyAlert`; locate handler |
| `er_twin/agents/orchestrator.py` | UPDATE | alert→locate→dispatch; in-flight dedupe (`OXY-IDEM-001`) |
| `er_twin/agents/nurse.py` | UPDATE | `StaffDispatchRequest` handler |
| `tests/test_event_oxygen.py` | CREATE | flow + no-unit error + idempotency |

- [ ] Phase 4 complete
- **Validation:** `uv run pytest tests/test_event_oxygen.py` + manual: chat *"Bed 3's patient oxygen is dropping"*.

---

## Phase 5 — Event 3: Status Summary

**Specs:** `SUMM-FLOW-001/002`, `SUMM-ERR-001`, `SUMM-STATE-001`

| File | Action | Reason |
|---|---|---|
| `er_twin/agents/orchestrator.py` | UPDATE | read-all state → LLM synthesis; empty-ER case |
| `tests/test_event_summary.py` | CREATE | summary content, empty-ER, read-only invariant |

- [ ] Phase 5 complete
- **Validation:** `uv run pytest tests/test_event_summary.py` + manual: chat *"Show me what's happening in the ER"*.

---

## Phase 6 — Redis Swap, Polish, Demo Scripting

**Deliverable:** real Redis; deterministic scripted demo; full suite green.

| File | Action | Reason |
|---|---|---|
| `er_twin/storage.py` | UPDATE | add `RedisStore` (same interface) |
| `er_twin/config.py` | UPDATE | select store by `REDIS_URL` presence |
| `scripts/demo.md` | CREATE | exact trigger phrases for the 3 events |
| `tests/test_storage.py` | UPDATE | run interface contract against `RedisStore` |

- [ ] Phase 6 complete
- **Validation:** `uv run ruff check . && uv run pytest` (full suite) with `REDIS_URL` set.

---

## Stretch (only if ahead at hour 20)

- [ ] FastAPI + HTML dashboard reading `er:events` pub/sub
- [ ] Pika incident replay via fal.ai (pre-generate one clip)
- [ ] PharmacyAgent + a 4th event

---

## Definition of Done

- [ ] All non-`[D]` EARS specs implemented and annotated `# @spec` in code + tests
- [ ] `uv run ruff check .` clean
- [ ] `uv run pytest` green (full suite), including every `ERR` and `IDEM` spec
- [ ] All 3 events fire end-to-end from a single hardcoded chat command each (deterministic)
- [ ] `USE_MOCK=true` runs the full demo with no external API calls
- [ ] `.env.example` present; no secrets committed
- [ ] STATUS.md updated to reflect completion; this plan moved to `docs/plans/old/`

---

## Testing Requirements

- Every `FLOW` spec → at least one happy-path test.
- Every `ERR` spec → a test exercising the failure branch.
- Every `IDEM` spec → a "fire the same trigger twice" test asserting no duplicate state.
- Every `DOMAIN` invariant → a guard test asserting the violation is rejected.
- All test functions carry `# @spec <ID>` for traceability.
