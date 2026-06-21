"""Tests for the read-only admin dashboard (fixture mode). Traces to docs/specs/dashboard-specs.md."""

from fastapi.testclient import TestClient

from dashboard import datasource
from dashboard.datasource import build_fixture_store, derive_summary, snapshot
from dashboard.server import app

client = TestClient(app)


# @spec DASH-API-001
def test_state_returns_all_entity_types():
    body = client.get("/api/state").json()
    for key in ("patients", "beds", "nurses", "doctors", "equipment"):
        assert key in body, f"missing {key}"
    assert body["patients"], "fixture should have patients"


# @spec DASH-API-003
def test_state_includes_derived_summary():
    summary = client.get("/api/state").json()["summary"]
    for key in ("active_patients", "occupied_beds", "free_nurses", "free_doctors", "active_alerts"):
        assert key in summary
    # Fixture: bed1 occupied; nurse2 + doc2 free; o2_1 at 45% (< 50) is one alert.
    assert summary["occupied_beds"] == 1
    assert summary["free_nurses"] == 1
    assert summary["free_doctors"] == 1
    assert summary["active_alerts"] == 1


# @spec DASH-SYS-004 — snapshot uses only the StorageInterface
def test_snapshot_assembles_from_store():
    snap = snapshot(build_fixture_store())
    assert {p["id"] for p in snap["patients"]} == {"p1", "p2", "p3"}
    assert len(snap["beds"]) == 4


# @spec DASH-API-002 — read endpoints never mutate state
def test_state_is_read_only():
    before = snapshot(build_fixture_store())
    client.get("/api/state")
    client.get("/api/state")
    after = snapshot(build_fixture_store())
    assert before == after


# @spec DASH-API-004
def test_events_endpoint_returns_lines():
    events = client.get("/api/events").json()["events"]
    assert isinstance(events, list) and events
    assert {"ts", "event", "detail"} <= set(events[0])


# @spec DASH-IN-002 — command input rejected while read-only
def test_command_rejected_when_input_disabled():
    r = client.post("/api/command", json={"phrase": "A new patient arrived with chest pain"})
    assert r.status_code == 403


# @spec DASH-API-003 — empty ER summarizes to zeros, not an error
def test_derive_summary_empty():
    empty = {"patients": [], "beds": [], "nurses": [], "doctors": [], "equipment": []}
    assert derive_summary(empty) == {
        "active_patients": 0,
        "occupied_beds": 0,
        "free_nurses": 0,
        "free_doctors": 0,
        "active_alerts": 0,
    }


# @spec DASH-ERR-003 — missing optional fields must not raise
def test_derive_summary_tolerates_partial_records():
    snap = {
        "patients": [{"id": "p9"}],
        "beds": [{"id": "b9"}],
        "nurses": [{}],
        "doctors": [{}],
        "equipment": [{}],
    }
    summary = derive_summary(snap)
    assert summary["active_patients"] == 1  # no status -> counted as active
    assert summary["active_alerts"] == 0


def test_fixture_is_default_source():
    # Guards the read-only baseline assumption used by the tests above. @spec DASH-SYS-001
    assert datasource.settings.dashboard_source == "fixture"
