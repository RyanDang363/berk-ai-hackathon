# Arrow: er-twin-core

Core Bureau, Orchestrator, protocols, and storage contracts for the ER twin.

## Status

**MAPPED** - 2026-06-20. Core references are catalogued, but a full spec-to-code audit has not yet been completed.

## References

| Type | Location |
|------|----------|
| HLD — architecture, stack, agent roster, events | [README.md](../../README.md) |
| LLD | [docs/llds/er-twin-core.lld.md](../llds/er-twin-core.lld.md) |
| EARS — 47 active specs | [docs/specs/er-events-specs.md](../specs/er-events-specs.md) |
| Tests | [tests/test_storage.py](../../tests/test_storage.py) |
| Code | [er_twin/storage.py](../../er_twin/storage.py), [er_twin/protocols.py](../../er_twin/protocols.py), [er_twin/config.py](../../er_twin/config.py), [er_twin/addresses.py](../../er_twin/addresses.py) |

## Architecture

**Purpose:** Define the shared core contracts and runtime model for the ER twin agent system.

**Key Components:**
1. `storage.py` — storage abstraction and in-memory implementation.
2. `protocols.py` — shared message schemas for intake, oxygen, summary, and skeleton flows.
3. `config.py` / `addresses.py` — runtime configuration and deterministic addressing.
4. Future `agents/` + `main.py` — Bureau wiring and Orchestrator/event execution path, still mostly absent.

## EARS Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Orchestrator foundation | ORCH-CHAT-001 to ORCH-SKEL-001 | 0 | 0 | 10 |
| Patient intake | INTAKE-FLOW-001 to INTAKE-IDEM-002 | 0 | 0 | 21 |
| Oxygen alert | OXY-FLOW-001 to OXY-IDEM-001 | 0 | 0 | 7 |
| Status summary | SUMM-FLOW-001 to SUMM-STATE-001 | 0 | 0 | 4 |
| Domain invariants | DOMAIN-STATE-001 to DOMAIN-STATE-003 | 0 | 0 | 3 |

**Summary:** 0 of 47 active specs implemented; first audit still needed to distinguish true gaps from contract-only groundwork already in place.

## Key Findings

1. **Contracts exist ahead of handlers** — shared protocol models and storage primitives are present in [er_twin/protocols.py](../../er_twin/protocols.py) and [er_twin/storage.py](../../er_twin/storage.py), but the agent runtime described in the LLD (`agents/`, `main.py`) is not yet present in the checked-in code.
2. **Tests currently cover storage only** — [tests/test_storage.py](../../tests/test_storage.py) exercises storage semantics, but there is no test evidence yet for orchestrator chat flow, intake flow, oxygen flow, or status-summary behavior.

## Work Required

### Must Fix
1. Audit the current codebase against [docs/specs/er-events-specs.md](../specs/er-events-specs.md) and classify which core specs are truly missing versus partially scaffolded.
2. Implement the first Orchestrator/Bureau slice or update the specs if the intended slice changed.

### Should Fix
1. Add tests for the first implemented event flow, not just the storage abstraction.

### Nice to Have
1. Split future core audits into smaller sub-arrows if the `er-twin-core` domain becomes too broad to track coherently in one doc.

