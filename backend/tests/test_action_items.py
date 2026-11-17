import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_action_items_persist_and_return_from_meeting_detail(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        meeting_id = "meeting-1"
        create_res = client.post(
            "/api/meetings",
            json={"meeting_id": meeting_id, "title": "周会", "segments": []},
        )
        assert create_res.status_code == 200

        save_res = client.put(
            f"/api/meetings/{meeting_id}/action-items",
            json={
                "items": [
                    {
                        "task": "跟进报价",
                        "owner": "Alice",
                        "due": "2026-04-05",
                        "done": False,
                    },
                    {
                        "task": "同步纪要",
                        "owner": "Bob",
                        "due": "2026-04-06",
                        "done": True,
                    },
                ]
            },
        )
        assert save_res.status_code == 200

        saved_items = save_res.json()
        assert len(saved_items) == 2
        assert saved_items[0]["id"]
        assert saved_items[0]["done"] is False
        assert saved_items[1]["done"] is True

        detail_res = client.get(f"/api/meetings/{meeting_id}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert len(detail["action_items"]) == 2
        assert detail["action_items"][0]["task"] == "跟进报价"
        assert detail["action_items"][1]["done"] is True

        toggle_res = client.put(
            f"/api/meetings/{meeting_id}/action-items",
            json={
                "items": [
                    {**saved_items[0], "done": True},
                    {**saved_items[1], "done": False},
                ]
            },
        )
        assert toggle_res.status_code == 200

        updated = client.get(f"/api/meetings/{meeting_id}").json()
        assert updated["action_items"][0]["done"] is True
        assert updated["action_items"][1]["done"] is False
