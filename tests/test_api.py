"""API smoke tests. Skipped when the trained model or processed data is not present."""

import re

import pytest

from attackpath.api import server

pytestmark = pytest.mark.skipif(
    not (server.MODEL.exists() and server.GRAPHS.exists() and server.NODES.exists()),
    reason="needs a trained model and processed data (run the pipeline first)",
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    with TestClient(server.app) as c:
        yield c


def test_networks_and_network(client):
    data = client.get("/api/networks").json()
    assert data["networks"] and data["default"] in [n["id"] for n in data["networks"]]
    gid = data["default"]
    net = client.get(f"/api/network/{gid}").json()
    assert len(net["nodes"]) == next(n["machines"] for n in data["networks"] if n["id"] == gid)
    assert len(net["stages"]) == net["hops"]
    assert all(abs(n["x"]) <= 1.0001 and abs(n["y"]) <= 1.0001 for n in net["nodes"])


def test_forecast_is_consistent(client):
    gid = client.get("/api/networks").json()["default"]
    f = client.get(f"/api/forecast/{gid}/0").json()
    n = len(f["p_next"])
    assert abs(sum(f["p_next"]) - 1) < 1e-3
    assert f["p_next"][f["current"]] == 0  # never "move" to where you already are
    assert f["footholds"] == [f["current"]]
    assert all(p["nodes"][0] in f["footholds"] for p in f["paths"])
    probs = [p["prob"] for p in f["paths"]]
    assert probs == sorted(probs, reverse=True)
    assert all(0 <= u < n and 0 <= v < n for u, v, _ in f["normal_edges"])
    assert 0 <= f["risk"] <= 1 and 0 <= f["confidence"] <= 1


def test_errors_and_static(client):
    assert client.get("/api/network/-1").status_code == 404
    gid = client.get("/api/networks").json()["default"]
    assert client.get(f"/api/forecast/{gid}/99").status_code == 404
    page = client.get("/")
    assert page.status_code == 200 and "Lateralis" in page.text
    summary = client.get("/api/summary").json()
    assert summary["split"]["test"] == len(client.get("/api/networks").json()["networks"])


def test_event_log_flags_attack_and_respects_time(client):
    gid = client.get("/api/networks").json()["default"]
    data = client.get(f"/api/events/{gid}").json()
    events, summary = data["events"], data["summary"]
    assert summary["events"] == len(events) > 0
    assert [e["time"] for e in events] == sorted(e["time"] for e in events)
    assert all(data["window"]["start"] <= e["hour"] <= data["window"]["end"] for e in events)
    # real calendar timestamps, e.g. 2026-10-31 15:02:42
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", e["label"]) for e in events)
    for e in events:
        if not e["remote"]:
            assert e["severity"] == "info" and e["unexpected"] is None
        if e["severity"] == "high":
            assert e["from_compromised"] and e["forecast_rank"] <= 3
        if e["unexpected"] is not None:
            assert 0 <= e["unexpected"] <= 1
    # every attack login comes from a compromised machine, so it is flagged
    attack = [e for e in events if e["attack"]]
    assert attack and all(e["severity"] in ("high", "medium") for e in attack)
    assert summary["attack_flagged"] == len(attack)


def test_report_pdf(client):
    gid = client.get("/api/networks").json()["default"]
    r = client.get(f"/api/report/{gid}/0")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-" and len(r.content) > 10_000
    assert "inline" in r.headers["content-disposition"]
    d = client.get(f"/api/report/{gid}/0?truth=0&download=1")
    assert "attachment" in d.headers["content-disposition"] and d.content[:5] == b"%PDF-"
    assert client.get(f"/api/report/{gid}/99").status_code == 404
