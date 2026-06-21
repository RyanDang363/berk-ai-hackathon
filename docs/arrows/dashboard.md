# Arrow: dashboard

Read-only admin dashboard UI, API, auth gate, and demo simulation around ER state.

## Status

**PARTIAL** - 2026-06-20. The fixture/sim dashboard, auth gate, and UI behavior are implemented and tested, but the live Redis snapshot and pub/sub event subscription path remain open gaps.

## References

| Type | Location |
|------|----------|
| HLD — stretch dashboard sections | [README.md](../../README.md) |
| LLD | [docs/llds/dashboard.lld.md](../llds/dashboard.lld.md) |
| EARS — 32 active specs | [docs/specs/dashboard-specs.md](../specs/dashboard-specs.md) |
| Tests | [tests/test_dashboard.py](../../tests/test_dashboard.py) |
| Code | [dashboard/server.py](../../dashboard/server.py), [dashboard/datasource.py](../../dashboard/datasource.py), [dashboard/sim.py](../../dashboard/sim.py), [dashboard/static/index.html](../../dashboard/static/index.html), [dashboard/static/app.js](../../dashboard/static/app.js), [dashboard/static/style.css](../../dashboard/static/style.css) |

## Architecture

**Purpose:** Provide a live operational surface over ER state with a demo-safe access gate and standalone fixture/simulation modes.

**Key Components:**
1. `server.py` — FastAPI routes, session auth, and optional Google OAuth.
2. `datasource.py` — snapshot assembly, derived summary, fixture/bootstrap event data, and source switching.
3. `sim.py` — scripted timeline for standalone demo playback.
4. `static/` — polling UI, live feedback, and inline detail rail interactions.

## EARS Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| API | DASH-API-001 to DASH-API-004 | 4 | 0 | 0 |
| System / data source | DASH-SYS-001 to DASH-SYS-004 | 2 | 0 | 2 |
| UI | DASH-UI-001 to DASH-UI-008 | 8 | 0 | 0 |
| Simulation | DASH-SIM-001 to DASH-SIM-002 | 2 | 0 | 0 |
| Error handling | DASH-ERR-001 to DASH-ERR-003 | 3 | 0 | 0 |
| Authentication | DASH-AUTH-001 to DASH-AUTH-010 | 10 | 0 | 0 |
| Input | DASH-IN-001 to DASH-IN-002 | 1 | 1 | 0 |

**Summary:** 30 of 32 active specs implemented; 1 deferred; 2 active gaps remain in the live Redis/event-subscription path.

## Key Findings

1. **Dashboard behavior is mostly coherent and test-backed** — [tests/test_dashboard.py](../../tests/test_dashboard.py) covers auth, API, simulation, and read-only behavior against the current server/datasource implementation.
2. **Live Redis path is the primary remaining gap** — [docs/specs/dashboard-specs.md](../specs/dashboard-specs.md) still marks `DASH-SYS-002` and `DASH-SYS-003` open, matching the placeholder `RedisStore` path and non-live event buffering in [dashboard/datasource.py](../../dashboard/datasource.py).
3. **Input remains intentionally deferred** — the seam exists in [dashboard/orchestrator_client.py](../../dashboard/orchestrator_client.py) and [dashboard/server.py](../../dashboard/server.py), but `DASH-IN-001` is correctly still deferred rather than drifted.

## Work Required

### Must Fix
1. Implement `DASH-SYS-002` and `DASH-SYS-003`: live Redis-backed snapshots and real `er:events` subscription support.

### Should Fix
1. Add frontend-level tests or lightweight browser checks for the new inline detail rail and card-selection behavior in the dashboard UI.

### Nice to Have
1. Extend the inline detail interaction to beds/equipment once the live Redis/event path is stable.

