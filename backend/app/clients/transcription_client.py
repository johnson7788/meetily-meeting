from ..diarization import transcribe_audio_without_diarization


async def transcribe_audio_file(file_bytes: bytes, filename: str, api_key: str) -> str:
    return await transcribe_audio_without_diarization(file_bytes, filename, api_key)
