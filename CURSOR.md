# CURSOR.md

Guidance for Cursor (and any AI agent) working in this repository. This mirrors [CLAUDE.md](CLAUDE.md) — keep the two in sync.

## What this project is

**ER Room Digital Twin** — an autonomous digital twin of a hospital emergency room. Every physical entity (patient, nurse, doctor, bed, equipment) is modeled as a **uAgent** running inside a single **uAgents Bureau** (one process, in-process messaging). A single **OrchestratorAgent** — registered on Agentverse with a mailbox + Chat Protocol — is the only public surface and is reachable from **ASI:One**. State is persisted in **Redis**. It's a hackathon build (24h target, Python 3.11+).

- **Full spec / High-Level Design:** [README.md](README.md) — the source of architectural intent.
- **Live development status + hand-off context:** [STATUS.md](STATUS.md) — read this first to know where things stand.

## How we work: spec-driven development

This repo follows **intent-driven development (IDD)**. Design intent is captured in docs *before* code, so a multi-person build doesn't drift into mismatched message names and Redis keys.

The arrow of intent: **README (HLD) → LLD/contracts → EARS specs → Tests → Code**

- Design docs live in `docs/llds/`, `docs/specs/`, and `docs/plans/`.
- **Before changing code, verify coherence:** do the EARS specs, tests, and code agree? If intent changed, update the doc *first*, then cascade downward — don't patch code and leave the spec stale.
- Annotate code and tests with `# @spec EVENT-XXX-NNN` comments tracing back to EARS spec IDs.
- Mutation, not accumulation: update docs in place, delete what's obsolete. Docs reflect *current* intent, not history.

Use the full design workflow for new features and major changes. For bug fixes and quick changes, skip doc creation but still verify intent coherence first.

## How we work: test-driven development

Follow **TDD whenever practical**, especially for agent message handlers and event flows:

1. Turn the relevant EARS spec into a failing test, tagged `# @spec <SPEC-ID>`.
2. Write the minimal handler/logic to make it pass.
3. Refactor with the test green.

Every state-mutating behavior should have a test, including idempotency (what happens when the same trigger fires twice?). Tests trace to EARS spec IDs so requirements stay verifiable.

When TDD doesn't fit (throwaway spikes, infra wiring, exploratory work), test-after is acceptable — but the behavior must end up covered before a slice is "done."

## Project conventions (RONGERS standards)

- **Language / runtime:** Python 3.11+
- **Agent framework:** `uagents` + `uagents-core` (Bureau for local agents; Chat Protocol on the Orchestrator only)
- **Layout:** single package `er_twin/` with `agents/`, `protocols.py` (shared message `Model`s), `storage.py`, `config.py`, `main.py`
- **Message schemas:** uAgent `Model` classes in shared `protocols.py`, named request/response (e.g. `PatientIntakeRequest` / `PatientIntakeResponse`)
- **State:** Redis hashes keyed `er:{entity}:{id}` (e.g. `er:patient:p1`), behind a `StorageInterface` — start with an in-memory dict, swap to Redis once core events work
- **Config:** `pydantic-settings` reading `.env`; a `USE_MOCK` flag returns hardcoded Orchestrator responses for demo reliability
- **Addresses:** deterministic seed-derived agent addresses set as constants at startup — no runtime discovery
- **Tooling:** `uv` (deps), `ruff` (format + lint), `pytest` (tests)
- **Secrets:** `.env` (never commit) + `.env.example`. Keys: `ASIONE_API_KEY`, `REDIS_URL`, `FAL_KEY`, `AGENT_SEED`

## Hard rules (demo-critical)

- **Only the OrchestratorAgent gets a mailbox / Agentverse registration.** All other agents are local Bureau agents — never try to host them on Agentverse.
- **The demo must be deterministic** — hardcode scripted triggers for the 3 events; no live randomness during judging.
- Keep instance counts small: 3 patients, 2 nurses, 2 doctors, 4 beds, a few equipment.
- Synthetic patient data only — no real PHI.

## Current focus

See [STATUS.md](STATUS.md). First slice: **Bureau + OrchestratorAgent skeleton** — Bureau up, Orchestrator registered, in-process messaging proven against one stub agent.
