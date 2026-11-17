import re
import uuid

from ..clients import transcription_client


def split_text_to_segments(text: str) -> list[dict]:
    parts = re.split(r"(?<=[。！？\n])\s*", text)
    parts = [part.strip() for part in parts if part.strip()]
    if not parts:
        parts = [text.strip()] if text.strip() else []
    return [
        {
            "id": uuid.uuid4().hex,
            "text": part,
            "timestamp": str(index * 5),
            "source": "upload",
            "is_partial": 0,
            "sequence_id": index,
        }
        for index, part in enumerate(parts)
    ]


async def transcribe_audio_file(file_bytes: bytes, filename: str, api_key: str) -> str:
    return await transcription_client.transcribe_audio_file(file_bytes, filename, api_key)


async def transcribe_audio_to_segments(file_bytes: bytes, filename: str, api_key: str) -> list[dict]:
    full_text = await transcribe_audio_file(file_bytes, filename, api_key)
    return split_text_to_segments(full_text)
