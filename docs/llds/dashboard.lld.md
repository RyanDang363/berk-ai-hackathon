# LLD — Admin Dashboard

**Component:** Read-only admin dashboard — a live view of ER state (patients, beds, staff, equipment) and an event log, served as a small web app.
**HLD reference:** [README.md](../../README.md) (§ Stretch — dashboard) and [er-twin-core.lld.md](er-twin-core.lld.md) (entity schema, Redis contracts).
**Status:** Draft — awaiting review.
**Owner:** Dev 3 (per [TEAM.md](../TEAM.md)).
**Scope:** the `dashboard/` package — FastAPI server, JSON API, and a static single-page frontend that polls it. Read-only in this version, architected so command input can be added later without a rewrite.

---

## RONGERS Standards Applied

- **Python 3.11+**, `FastAPI` + `uvicorn` for the server; **vanilla HTML/JS/CSS** frontend (no build step — demo-proof, zero config for teammates).
- **Reads state only through `StorageInterface`** ([storage.py](../../er_twin/storage.py)) — never a concrete backend directly. Source is selected at startup (fixture vs Redis).
- **Config:** reuse `er_twin.config.settings` (`redis_url`); add dashboard fields (`dashboard_source`, `dashboard_allow_input`, `dashboard_port`) — append-only to `Settings`.
- **Read-only:** the dashboard never mutates entity state (mirrors `SUMM-STATE-001`).
- **Tooling:** `uv`, `ruff`, `pytest` (FastAPI `TestClient`). TDD for the API layer.

---

## 1. Module Layout

```
dashboard/
├── __init__.py
├── server.py            # FastAPI app + routes
├── datasource.py        # get_store(), snapshot(store), derive_summary(), event buffer
├── orchestrator_client.py   # STUB — send_command(phrase); the seam for future input
├── fixtures/
│   └── er_state.json    # mock state (the TEAM.md fixture) for fixture mode
└── static/
    ├── index.html
    ├── app.js           # polling + render
    └── style.css
tests/
└── test_dashboard.py    # API schema + read-only contract (FastAPI TestClient)
```

Run: `uvicorn dashboard.server:app --port {dashboard_port}`.

---

## 2. Data Contracts

### Entity records
The dashboard does **not** define entity shapes — it surfaces the records from
[er-twin-core.lld.md §2](er-twin-core.lld.md) (patient, bed, nurse, doctor, equipment) verbatim.
The `fixtures/er_state.json` fixture is the canonical example shape (from [TEAM.md](../TEAM.md)).

### Snapshot assembly (the fixture↔Redis seam)
A single function builds the snapshot from any `StorageInterface`, so fixture mode and Redis mode
share identical code:

```
snapshot(store) ->
  for entity in ["patient","bed","nurse","doctor","equipment"]:
      ids  = store.list_ids(entity)
      rows = [store.get(f"er:{entity}:{id}") for id in ids]
  returns {patients, beds, nurses, doctors, equipment}
```

- **Fixture mode:** load `er_state.json` into an `InMemoryStore` at startup, then run `snapshot`.
- **Redis mode:** `snapshot(RedisStore(settings.redis_url))`.

The swap is choosing which store `get_store()` returns — nothing else changes.

### Derived summary (KPIs)
`derive_summary(snapshot)` computes display-only aggregates (no new state):
`active_patients`, `occupied_beds`, `free_nurses`, `free_doctors`, `active_alerts`
(an alert = an `oxygen` equipment record whose `supply_level` is below the low threshold).

> **Threshold coordination:** the low-oxygen threshold must match the value the `EquipmentAgent`
> uses for `OXY-FLOW-001`. Single source — import/agree one constant; do not hardcode a second.

### Event line shape (`er:events`)
The Orchestrator publishes one JSON line per event to the `er:events` channel ([core LLD §4](er-twin-core.lld.md)).
Agreed shape: `{"ts": ISO-8601 str, "event": str, "detail": str}`. The dashboard is a consumer only.

---

## 3. API Contracts (own surface)

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/` | `text/html` | the single-page app |
| GET | `/api/state` | `{generated_at, summary, patients, beds, nurses, doctors, equipment}` | full snapshot + KPIs; read-only |
| GET | `/api/events` | `{events: [{ts, event, detail}, …]}` | most recent ≤ N (ring buffer) |
| POST | `/api/command` | `{accepted: bool}` | **feature-flagged off**; `403` while `dashboard_allow_input=false` |

Static assets served from `dashboard/static/`.

---

## 4. Control Flow

### State (polling)
1. Browser `app.js` calls `GET /api/state` every `POLL_MS` (~1000 ms).
2. Server runs `snapshot(get_store())` + `derive_summary()`, returns JSON.
3. Frontend re-renders panels (KPI strip, bed grid, patients, staff, equipment).

### Event log (pub/sub → buffer → poll)
1. On startup, a background task subscribes to `er:events` (Redis pub/sub) and pushes lines into an in-process **ring buffer** (last N, e.g. 50).
2. `GET /api/events` returns the buffer.
3. Frontend polls it and appends new lines.

> In fixture mode (no Redis), the event buffer is seeded from a fixture list so the log panel is
> demonstrable without a running Bureau.

### End-to-end (why the dashboard reflects "told new info")
`ASI:One chat → Orchestrator → entity agents mutate Redis → (1s poll picks up new state)`, and in
parallel `Orchestrator publishes er:events line → dashboard buffer → log panel`.

---

## 5. Read-only now, input-ready later

The upgrade to command input must be **additive**, never a refactor:
- `orchestrator_client.py` ships as a stub with the real signature `send_command(phrase: str) -> bool`.
- `POST /api/command` is scaffolded but returns `403` while `dashboard_allow_input` is false.
- The frontend has a command-bar slot hidden behind the same flag.

When enabled later, the only real work is implementing `send_command` — a uAgent client sending a
`ChatMessage` to the Orchestrator address (pattern: [uagents-chat-protocol.md](../../fetch-ai-documentation/uagents-chat-protocol.md) client example).

---

## 6. Error Handling

- **Redis unavailable (Redis mode):** `/api/state` returns the last successful snapshot if available,
  else `503`; the frontend shows a non-blocking "data source unavailable" banner and keeps polling.
  Never crash the server.
- **Empty ER:** all arrays empty → frontend renders empty-state placeholders, not errors (parallels `SUMM-ERR-001`).
- **Partial/missing fields:** a record missing an optional field renders a default/`—`; no exception.
- **Event buffer overflow:** ring buffer drops oldest beyond N.
- **Read-only guarantee:** no route mutates the store while `dashboard_allow_input=false`.

---

## 7. Decisions & Alternatives

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| State delivery | Browser **polling** ~1s | WebSocket/SSE push | Bulletproof for judging; no connection-drop failure mode; trivially "live enough" |
| State access | Read through `StorageInterface` | Read Redis directly in dashboard | One code path for fixture + Redis; the swap is one line; testable without Redis |
| Process model | **Separate** FastAPI process, shared via Redis | Embed FastAPI in the Bureau process | Decouples dashboard from agent runtime; avoids threading against the uAgents event loop |
| Interactivity | **Read-only**, seam for input | Full input now | Smaller, safer baseline; input added additively later (user decision) |
| Frontend | Vanilla HTML/JS | React/Vue + build | No build step, no toolchain risk during a 24h build |

---

## 8. Edge Case Resolutions

| # | Edge case | Resolution |
|---|---|---|
| 1 | Redis down mid-demo | Last-good snapshot + banner; 503 only if no prior snapshot. No crash. |
| 2 | Empty ER | Graceful empty states across all panels. |
| 3 | Record missing optional field | Render default `—`; never throw. |
| 4 | Event log floods | Ring buffer caps at N (≈50); oldest dropped. |
| 5 | Poll lands mid-write | Acceptable — next poll (≤1s) reconciles; reads are per-record dict copies. |
| 6 | Fixture vs live field drift | Single schema source (core LLD §2); fixture mirrors it; tests assert required keys. |
| 7 | Oxygen threshold mismatch with agent | Share one threshold constant with `EquipmentAgent` (see §2). |
| 8 | Command POST while disabled | `403` + hidden UI; no state change. |

---

*Specs: [dashboard-specs.md](../specs/dashboard-specs.md) (`DASH-*`). Plan: dashboard is a stretch track in [the implementation plan](../plans/2026-06-20-er-twin-core.plan.md); build phases in TEAM.md.*
