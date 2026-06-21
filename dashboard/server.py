"""FastAPI server for the read-only admin dashboard.

@spec DASH-API-001, DASH-API-002, DASH-API-003, DASH-API-004, DASH-ERR-001, DASH-IN-002

Run: uvicorn dashboard.server:app --port 8050
"""

from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from er_twin.config import settings

from .datasource import build_event_buffer, derive_summary, get_store, snapshot

_STATIC = Path(__file__).parent / "static"

app = FastAPI(title="ER Twin — Admin Dashboard")
app.mount("/static", StaticFiles(directory=_STATIC), name="static")

_events = build_event_buffer(maxlen=50)
_last_good: dict | None = None


@app.get("/")
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/api/state")
def api_state() -> JSONResponse:
    """Full read-only snapshot + derived KPIs. Falls back to last-good if the source is down."""
    global _last_good
    try:
        snap = snapshot(get_store())
    except Exception:  # noqa: BLE001 — source unavailable must never crash the server
        if _last_good is not None:
            return JSONResponse({**_last_good, "stale": True})
        raise HTTPException(status_code=503, detail="data source unavailable") from None

    payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "summary": derive_summary(snap),
        **snap,
        "stale": False,
    }
    _last_good = payload
    return JSONResponse(payload)


@app.get("/api/events")
def api_events() -> JSONResponse:
    return JSONResponse({"events": _events.recent()})


@app.post("/api/command")
def api_command(body: dict) -> JSONResponse:
    """Deferred input route — rejected while read-only. @spec DASH-IN-002"""
    if not settings.dashboard_allow_input:
        raise HTTPException(
            status_code=403, detail="command input is disabled (read-only dashboard)"
        )
    from .orchestrator_client import send_command

    accepted = send_command(body.get("phrase", ""))
    return JSONResponse({"accepted": accepted})
