import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
import app.api.routes.meetings as meetings_routes
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_upload_meeting_uses_tingwu_segments_and_preserves_relative_timestamps(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")
    monkeypatch.setenv("MEETILY_PUBLIC_BASE_URL", "https://ai.infox-med.com:10443/dev")

    async def fake_transcribe(file_bytes: bytes, filename: str, public_base_url: str):
        assert file_bytes == b"audio-bytes"
        assert filename == "demo.m4a"
        assert public_base_url == "https://ai.infox-med.com:10443/dev"
        return [
            {
                "id": "seg-1",
                "text": "第一句。",
                "timestamp": "00:00",
                "source": "speaker_1",
                "is_partial": 0,
                "sequence_id": 0,
            },
            {
                "id": "seg-2",
                "text": "第二句。",
                "timestamp": "00:05",
                "source": "speaker_2",
                "is_partial": 0,
                "sequence_id": 1,
            },
        ]

    monkeypatch.setattr(meetings_routes.meeting_service, "transcribe_file_with_tingwu", fake_transcribe)

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        response = client.post(
            "/api/meetings/upload",
            files={"file": ("demo.m4a", b"audio-bytes", "audio/mp4")},
            data={"title": "上传会议", "project_name": "Alpha"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["title"] == "上传会议"

        detail = client.get(f"/api/meetings/{payload['meeting_id']}").json()
        assert detail["title"] == "上传会议"
        assert detail["project_name"] == "Alpha"
        assert [segment["text"] for segment in detail["transcripts"]] == ["第一句。", "第二句。"]
        assert [segment["timestamp"] for segment in detail["transcripts"]] == ["00:00", "00:05"]
        assert [segment["source"] for segment in detail["transcripts"]] == ["speaker_1", "speaker_2"]
        assert [item["label"] for item in detail["speaker_labels"]] == ["说话人1", "说话人2"]
