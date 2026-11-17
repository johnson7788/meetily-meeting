import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_meetings_return_project_name_and_default_unclassified(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        classified_res = client.post(
            "/api/meetings",
            json={
                "meeting_id": "meeting-1",
                "title": "产品周会",
                "project_name": "Alpha 项目",
                "segments": [],
            },
        )
        assert classified_res.status_code == 200

        unclassified_res = client.post(
            "/api/meetings",
            json={
                "meeting_id": "meeting-2",
                "title": "临时沟通",
                "segments": [],
            },
        )
        assert unclassified_res.status_code == 200

        meetings_res = client.get("/api/meetings")
        assert meetings_res.status_code == 200

        meetings = meetings_res.json()
        assert meetings[0]["project_name"] is None
        assert meetings[1]["project_name"] == "Alpha 项目"

        detail_res = client.get("/api/meetings/meeting-1")
        assert detail_res.status_code == 200
        assert detail_res.json()["project_name"] == "Alpha 项目"
