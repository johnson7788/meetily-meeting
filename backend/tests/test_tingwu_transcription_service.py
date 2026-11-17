import asyncio

from app.services import tingwu_transcription_service


def test_transcribe_file_with_tingwu_uses_public_url_and_normalizes_speakers(monkeypatch):
    calls = {}

    def fake_publish_temp_media(file_bytes: bytes, filename: str, public_base_url: str, expires_in_seconds: int = 0):
        calls["publish"] = {
            "file_bytes": file_bytes,
            "filename": filename,
            "public_base_url": public_base_url,
            "expires_in_seconds": expires_in_seconds,
        }
        return {
            "token": "temp-token",
            "url": "https://ai.infox-med.com:10443/dev/api/internal/temp-media/temp-token/demo.wav",
            "path": "/tmp/demo.wav",
            "filename": "demo.wav",
        }

    class FakeClient:
        async def create_offline_task(self, *, file_url: str, source_language: str, speaker_count: int, language_hints: list[str] | None):
            calls["create_offline_task"] = {
                "file_url": file_url,
                "source_language": source_language,
                "speaker_count": speaker_count,
                "language_hints": language_hints,
            }
            return "task-1"

        async def wait_for_offline_task(self, task_id: str):
            calls["wait_for_offline_task"] = task_id
            return {
                "Data": {
                    "TaskStatus": "COMPLETED",
                    "Result": {
                        "Transcription": "https://example.com/result.json"
                    },
                }
            }

        async def fetch_json(self, url: str):
            calls["fetch_json"] = url
            return {
                "TaskId": "task-1",
                "Transcription": {
                    "Paragraphs": [
                        {
                            "ParagraphId": "p-1",
                            "SpeakerId": "12",
                            "Words": [
                                {"Id": 1, "SentenceId": 1, "Start": 0, "End": 400, "Text": "大家好"},
                                {"Id": 2, "SentenceId": 1, "Start": 400, "End": 800, "Text": "。"},
                            ],
                        },
                        {
                            "ParagraphId": "p-2",
                            "SpeakerId": "28",
                            "Words": [
                                {"Id": 3, "SentenceId": 2, "Start": 1500, "End": 1900, "Text": "第二位"},
                                {"Id": 4, "SentenceId": 2, "Start": 1900, "End": 2300, "Text": "发言"},
                            ],
                        },
                        {
                            "ParagraphId": "p-3",
                            "SpeakerId": "42",
                            "Words": [
                                {"Id": 5, "SentenceId": 3, "Start": 3000, "End": 3400, "Text": "第三位"},
                                {"Id": 6, "SentenceId": 3, "Start": 3400, "End": 3900, "Text": "补充"},
                            ],
                        },
                    ]
                },
            }

    monkeypatch.setattr(tingwu_transcription_service.temp_media, "publish_temp_media", fake_publish_temp_media)

    cleaned = []
    monkeypatch.setattr(tingwu_transcription_service.temp_media, "delete_temp_media", lambda token: cleaned.append(token))

    segments = asyncio.run(
        tingwu_transcription_service.transcribe_file_with_tingwu(
            b"audio-bytes",
            "demo.wav",
            public_base_url="https://ai.infox-med.com:10443/dev",
            client=FakeClient(),
        )
    )

    assert calls["create_offline_task"]["file_url"].endswith("/demo.wav")
    assert calls["create_offline_task"]["speaker_count"] == 0
    assert [segment["source"] for segment in segments] == ["speaker_1", "speaker_2", "speaker_3"]
    assert [segment["timestamp"] for segment in segments] == ["00:00", "00:01", "00:03"]
    assert [segment["text"] for segment in segments] == ["大家好。", "第二位发言", "第三位补充"]
    assert cleaned == ["temp-token"]
