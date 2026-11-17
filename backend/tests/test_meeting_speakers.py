import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_speaker_labels_persist_and_transcript_postprocesses(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        meeting_id = "meeting-speakers-1"
        create_res = client.post(
            "/api/meetings",
            json={
                "meeting_id": meeting_id,
                "title": "周会",
                "hot_words": "AI平台",
                "segments": [
                    {
                        "id": "t1",
                        "text": "我们重点看 AI 平 台 的落地情况。",
                        "timestamp": "0",
                        "source": "spk_0",
                    },
                    {
                        "id": "t2",
                        "text": "研发会先补齐接口。",
                        "timestamp": "5",
                        "source": "spk_1",
                    },
                ],
            },
        )
        assert create_res.status_code == 200

        detail = client.get(f"/api/meetings/{meeting_id}").json()
        assert [item["source"] for item in detail["speaker_labels"]] == ["spk_0", "spk_1"]
        assert [item["label"] for item in detail["speaker_labels"]] == ["说话人1", "说话人2"]
        assert detail["transcripts"][0]["postprocessed_text"] == "我们重点看 AI平台 的落地情况。"

        rename_res = client.put(
            f"/api/meetings/{meeting_id}/speaker-labels/spk_0",
            json={"source": "spk_0", "label": "产品"},
        )
        assert rename_res.status_code == 200

        updated = client.get(f"/api/meetings/{meeting_id}").json()
        assert updated["speaker_labels"][0]["label"] == "产品"
        assert updated["speaker_labels"][1]["label"] == "说话人2"
