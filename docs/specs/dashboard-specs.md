# EARS Specs — Admin Dashboard

**Traces to:** [dashboard.lld.md](../llds/dashboard.lld.md) → [README (HLD)](../../README.md)
**Status markers:** `[ ]` active gap · `[x]` implemented · `[D]` deferred

Spec ID format: `{FEATURE}-{TYPE}-{NNN}`. Feature: `DASH`. Types: `API`, `SYS`, `UI`, `ERR`, `IN` (input — deferred).

---

## DASH — API

- [x] **DASH-API-001** — When `GET /api/state` is requested, the dashboard shall return a snapshot containing the current patients, beds, nurses, doctors, and equipment read from the configured store.
- [x] **DASH-API-002** — When serving any read endpoint, the dashboard shall not mutate any entity state. *(ubiquitous read-only invariant)*
- [x] **DASH-API-003** — When `GET /api/state` is requested, the dashboard shall include a derived summary of active patient count, occupied bed count, free nurse and doctor counts, and active alert count.
- [x] **DASH-API-004** — When `GET /api/events` is requested, the dashboard shall return the most recent buffered `er:events` lines (at most the buffer size N), each with `ts`, `event`, and `detail`.

## DASH — System / Data Source

- [x] **DASH-SYS-001** — Where `dashboard_source` is `fixture`, the dashboard shall load `fixtures/er_state.json` into an in-memory store and serve snapshots from it.
- [ ] **DASH-SYS-002** — Where `dashboard_source` is `redis`, the dashboard shall serve snapshots by reading entity records through the `StorageInterface` backed by Redis at `settings.redis_url`. *(get_store() path stubbed; awaits Dev 2 RedisStore)*
- [ ] **DASH-SYS-003** — When the dashboard starts in `redis` mode, it shall subscribe to the `er:events` channel and append each received line to a ring buffer capped at N entries. *(buffer built; live pub/sub subscription not yet wired)*
- [x] **DASH-SYS-004** — The dashboard shall assemble snapshots only through `StorageInterface.list_ids` and `StorageInterface.get`, never through a concrete backend directly. *(ubiquitous)*

## DASH — UI

- [x] **DASH-UI-001** — While the page is open, the frontend shall poll `GET /api/state` approximately every second and re-render the panels with the latest snapshot.
- [x] **DASH-UI-002** — When rendering beds, the frontend shall colour-code each bed by its status (`available`, `occupied`, `cleaning`) and show its occupant and specialty.
- [x] **DASH-UI-003** — When an oxygen equipment record's `supply_level` is below the low-oxygen threshold, the frontend shall display it as an active alert.
- [x] **DASH-UI-004** — While the page is open, the frontend shall poll `GET /api/events` and append new event lines to the live event log.
- [x] **DASH-UI-005** — When a snapshot contains no patients and no occupied beds, the frontend shall render empty-state placeholders rather than an error.

## DASH — Error Handling

- [x] **DASH-ERR-001** — If the Redis source is unavailable, then the dashboard shall return the last successful snapshot when one exists, otherwise respond `503`, and shall not crash.
- [x] **DASH-ERR-002** — If the Redis source is unavailable, then the frontend shall display a non-blocking "data source unavailable" banner and continue polling.
- [x] **DASH-ERR-003** — If an entity record is missing an optional field, then the dashboard shall render a default placeholder for it without raising an error.

## DASH — Authentication (demo access gate — not real HIPAA compliance)

- [x] **DASH-AUTH-001** — When valid credentials are submitted to `POST /login`, the dashboard shall establish an authenticated session and redirect to the dashboard.
- [x] **DASH-AUTH-002** — If invalid credentials are submitted to `POST /login`, then the dashboard shall not establish a session and shall redirect back to the login page with an error indication.
- [x] **DASH-AUTH-003** — If an unauthenticated client requests a protected page, then the dashboard shall redirect it to the login page.
- [x] **DASH-AUTH-004** — If an unauthenticated client requests a protected API endpoint, then the dashboard shall respond `401`.
- [x] **DASH-AUTH-005** — When an authenticated client requests logout, the dashboard shall clear the session.
- [x] **DASH-AUTH-006** — The dashboard shall serve the login page and static assets without authentication. *(ubiquitous — login must be reachable)*

## DASH — Input (deferred — read-only baseline)

- [D] **DASH-IN-001** — Where `dashboard_allow_input` is enabled, when `POST /api/command` is received, the dashboard shall forward the phrase to the OrchestratorAgent via `send_command`.
- [x] **DASH-IN-002** — If `POST /api/command` is received while `dashboard_allow_input` is disabled, then the dashboard shall respond `403` and shall not change any state.

---

## Consistency Report

- **Coverage:** every API route, data-source mode, UI panel, and error case in the LLD has ≥1 spec. Input routes are specified but `[D]` deferred (read-only baseline per user decision).
- **Read-only:** `DASH-API-002` (ubiquitous) plus `DASH-IN-002` guard the no-mutation guarantee; no `IDEM` specs needed because the baseline performs no writes.
- **Cross-component dependencies:** `DASH-SYS-002/003` depend on Dev 2's `RedisStore` and Dev 1's Orchestrator publishing to `er:events`; `DASH-UI-003` depends on a shared low-oxygen threshold constant with the `EquipmentAgent`.
- **Idempotency:** N/A for the read-only baseline (no state-mutating behavior).

---

*Next: implement Phase 1 (UI on fixture) TDD against these specs, tagging tests `# @spec DASH-*`.*
