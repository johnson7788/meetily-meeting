import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
import app.api.routes.meetings as meetings_routes
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_recorded_meeting_upload_uses_tingwu_segments_and_generic_labels(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")
    monkeypatch.setenv("MEETILY_PUBLIC_BASE_URL", "https://ai.infox-med.com:10443/dev")

    async def fake_transcribe(*_args, **_kwargs):
        return [
            {
                "id": "seg-1",
                "text": "先说一下当前进展。",
                "timestamp": "00:00",
                "source": "speaker_7",
                "sequence_id": 0,
            },
            {
                "id": "seg-2",
                "text": "我这边补充两点。",
                "timestamp": "00:02",
                "source": "speaker_12",
                "sequence_id": 1,
            },
        ]

    monkeypatch.setattr(meetings_routes.meeting_service, "transcribe_file_with_tingwu", fake_transcribe)

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        response = client.post(
            "/api/meetings/recorded",
            files={"file": ("recording.wav", b"wav-bytes", "audio/wav")},
            data={
                "meeting_id": "recorded-case-1",
                "title": "周会录音",
                "raw_segments": json.dumps([{"id": "rt-1", "text": "实时稿", "timestamp": "00:00"}], ensure_ascii=False),
            },
        )

        assert response.status_code == 200
        assert response.json() == {"meeting_id": "recorded-case-1"}

        detail = client.get("/api/meetings/recorded-case-1").json()
        assert [segment["source"] for segment in detail["transcripts"]] == ["speaker_1", "speaker_2"]
        assert [item["source"] for item in detail["speaker_labels"]] == ["speaker_1", "speaker_2"]
        assert [item["label"] for item in detail["speaker_labels"]] == ["说话人1", "说话人2"]
