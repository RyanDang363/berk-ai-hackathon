# STATUS — ER Room Digital Twin

> **Purpose:** Live development tracker + hand-off context for any Claude/human session picking this up.
> Keep this file current. Update it whenever a decision is made, a phase completes, or an open question is resolved.

**Last updated:** 2026-06-20

---

## TL;DR for a fresh session

- **What this is:** Autonomous digital twin of a hospital ER. Every entity (patient, nurse, doctor, bed, equipment) is a uAgent inside one **uAgents Bureau** (in-process). A single **OrchestratorAgent** (mailbox + Chat Protocol + ASI:One) is the only public surface. State in **Redis**. Full spec: [README.md](README.md).
- **Method:** Lean **intent-driven development (IDD)**. README *is* the High-Level Design. We derive LLD contracts → EARS specs → implementation plan, then code.
- **Where we are:** Design **complete** (LLD + EARS + Plan all written and coherent). No code yet. Plan awaiting final go-ahead.
- **Next concrete step:** Start implementation — Phase 0 (scaffold) → Phase 1 (Bureau + Orchestrator skeleton), TDD, per the [plan](docs/plans/2026-06-20-er-twin-core.plan.md).

---

## Current Phase

### Phase: Design complete → Implementation pending

Lean IDD pipeline for this effort:

- [x] **LLD + contracts** → [docs/llds/er-twin-core.lld.md](docs/llds/er-twin-core.lld.md) — DONE. Contracts + Redis schema set; all 10 edge cases resolved.
- [x] **EARS specs** → [docs/specs/er-events-specs.md](docs/specs/er-events-specs.md) — DONE. ~48 specs across ORCH/INTAKE/OXY/SUMM/DOMAIN. All A/B questions + DK1–3 resolved (pooled PatientAgents, Q1=A, Q2=B, Q3=A, DK all true).
- [x] **Implementation plan** → [docs/plans/2026-06-20-er-twin-core.plan.md](docs/plans/2026-06-20-er-twin-core.plan.md) — DONE, awaiting review. 7 phases (Phase 1 = first slice).
- [ ] **Implementation** — Phase 0 (scaffold) → Phase 1 (Bureau + Orchestrator skeleton) next

---

## Decisions Made

| Decision | Choice | Date |
| --- | --- | --- |
| Workflow depth | **Lean IDD** — README = HLD; produce LLD contracts + EARS + one plan. No separate HLD/PRD. | 2026-06-20 |
| First slice to build | **Bureau + OrchestratorAgent skeleton** — Bureau up, Orchestrator registered (mailbox + Chat Protocol + ASI:One), in-process messaging proven against one stub agent. | 2026-06-20 |
| Standards source | **Sensible defaults accepted** — captured as `RONGERS Standards Applied` in the LLD. uv + ruff + pytest, single `er_twin/` package, shared `protocols.py` (request/response `Model`s), `er:{entity}:{id}` Redis hashes behind `StorageInterface`, `pydantic-settings` config with `USE_MOCK` flag. | 2026-06-20 |
| Patient as agent | **Pooled PatientAgents** — N (=3) pre-instantiated at startup, bound + hydrated at intake. Not record-only, not dynamic-spawn (spawn is fragile: unsupported runtime Bureau mutation, breaks startup addressing, dropped-message window). | 2026-06-20 |
| Intake design (Q1/Q2/Q3) | Q1=A acuity 1–5 invariant; Q2=B page a doctor on acuity ≤ 2; Q3=A explicit assignment-idempotency spec. DK1–3 confirmed as `DOMAIN-STATE-*`. | 2026-06-20 |

Architecture decisions are fixed in the spec — see [README.md § Key Architecture Decisions](README.md#key-architecture-decisions). Notably: Bureau for all internal agents, single Agentverse mailbox, Redis behind a `StorageInterface` (in-memory dict first), `USE_MOCK` fallback flag.

---

## Open Questions

*None blocking.* Standards resolved with defaults (see Decisions). Conventions are recorded in the `RONGERS Standards Applied` section of the LLD. The user may override any convention when reviewing the LLD.

---

## First Slice — Definition of Done (target)

Bureau + Orchestrator skeleton is "done" when:

- [ ] Bureau process starts cleanly with the Orchestrator + ≥1 stub agent
- [ ] OrchestratorAgent registers with mailbox + Chat Protocol (reachable from ASI:One)
- [ ] A natural-language message to the Orchestrator triggers an in-process uAgent message to the stub agent and a reply flows back
- [ ] Agent addresses are deterministic (seed-derived constants set at startup — no runtime discovery)
- [ ] `USE_MOCK` flag returns a hardcoded Orchestrator response when set

---

## Environment / Secrets

`.env` keys (never commit `.env`; keep `.env.example`): `ASIONE_API_KEY`, `REDIS_URL`, `FAL_KEY`, `AGENT_SEED`.

Stack: Python 3.11+, `uagents` + `uagents-core`, Redis, ASI:One LLM API. Pika via fal.ai is stretch only.

---

## The 3 Demo Events (the whole point)

Each must be triggerable by a hardcoded NL command to the Orchestrator via ASI:One:

1. **Patient Intake** — *"A new patient arrived with chest pain"*
2. **Low Oxygen Alert** — *"Bed 3's patient oxygen is dropping"*
3. **Status Summary** — *"Show me what's happening in the ER"*

Flows: see [README.md § Events](README.md#events--core-demo-scenarios).

---

## Hand-off Notes / Gotchas

- **Do NOT** host every agent on Agentverse — only the Orchestrator gets a mailbox. Everything else is local Bureau. (Repeated in the spec because it's the #1 way to wreck the demo.)
- Demo must be **deterministic** — hardcode scripted triggers; no live randomness during judging.
- Build Redis behind an in-memory `StorageInterface` first; swap to real Redis once core events work.
- Keep instance counts small: 3 patients, 2 nurses, 2 doctors, 4 beds, a few equipment.
- Annotate code with `# @spec <SPEC-ID>` comments tracing to EARS specs (Python comment style).
- Pooled PatientAgents: 3 created at startup, bound at intake — never spawn agents at runtime (see LLD §7).
