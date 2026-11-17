import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import db
import app.api.routes.meetings as meetings_routes
from app.main import app
from tests.conftest import TEST_AUTH_HEADERS


def test_translate_meeting_adds_translated_text_without_overwriting_original(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")

    calls: list[str] = []

    async def fake_translate(text: str, provider: str, model: str, api_key: str) -> str:
        calls.append(text)
        return f"翻译：{text}"

    monkeypatch.setattr(meetings_routes.meeting_service.summary_service, "translate_transcript_text", fake_translate)

    with TestClient(app, headers=TEST_AUTH_HEADERS) as client:
        meeting_id = "meeting-translate-1"
        create_res = client.post(
            "/api/meetings",
            json={
                "meeting_id": meeting_id,
                "title": "英文会议",
                "segments": [
                    {
                        "id": "t1",
                        "text": "We will focus on the roadmap.",
                        "postprocessed_text": "We will focus on the roadmap.",
                        "timestamp": "0",
                        "source": "spk_0",
                    },
                    {
                        "id": "t2",
                        "text": "The team can ship it next week.",
                        "postprocessed_text": "The team can ship it next week.",
                        "timestamp": "5",
                        "source": "spk_1",
                    },
                ],
            },
        )
        assert create_res.status_code == 200

        translate_res = client.post(f"/api/meetings/{meeting_id}/translate")
        assert translate_res.status_code == 200
        assert translate_res.json() == {"translated": 2}
        assert calls == [
            "We will focus on the roadmap.",
            "The team can ship it next week.",
        ]

        detail = client.get(f"/api/meetings/{meeting_id}").json()
        assert [item["text"] for item in detail["transcripts"]] == [
            "We will focus on the roadmap.",
            "The team can ship it next week.",
        ]
        assert [item["translated_text"] for item in detail["transcripts"]] == [
            "翻译：We will focus on the roadmap.",
            "翻译：The team can ship it next week.",
        ]
