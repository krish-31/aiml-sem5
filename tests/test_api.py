"""API smoke tests. Skipped when the trained model or processed data is not present."""

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
    assert page.status_code == 200 and "AttackPath" in page.text
    summary = client.get("/api/summary").json()
    assert summary["split"]["test"] == len(client.get("/api/networks").json()["networks"])
