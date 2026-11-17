import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.services.transcription_service as transcription_service


def test_transcribe_audio_to_segments_splits_transcript_text(monkeypatch):
    calls: list[tuple[bytes, str, str]] = []

    async def fake_transcribe_audio_file(file_bytes: bytes, filename: str, api_key: str) -> str:
        calls.append((file_bytes, filename, api_key))
        return "第一句。\n第二句。第三句。"

    monkeypatch.setattr(transcription_service, "transcribe_audio_file", fake_transcribe_audio_file)

    segments = asyncio.run(
        transcription_service.transcribe_audio_to_segments(
            b"audio-bytes",
            "audio.m4a",
            "test-key",
        )
    )

    assert calls == [(b"audio-bytes", "audio.m4a", "test-key")]
    assert [segment["text"] for segment in segments] == ["第一句。", "第二句。", "第三句。"]
    assert [segment["sequence_id"] for segment in segments] == [0, 1, 2]
