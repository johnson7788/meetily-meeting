import uuid
from collections import OrderedDict

from ..models import DiarizedTranscriptSegment
from .. import temp_media
from ..tingwu_client import TingwuClient


def normalize_tingwu_transcription_payload(payload: dict) -> list[dict]:
    paragraphs = payload.get("Transcription", {}).get("Paragraphs", [])
    sentence_map: OrderedDict[tuple[str, str], dict] = OrderedDict()
    speaker_map: dict[str, str] = {}

    for paragraph in paragraphs:
        raw_speaker = str(paragraph.get("SpeakerId") or paragraph.get("speakerId") or "unknown")
        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"speaker_{len(speaker_map) + 1}"

        for word in paragraph.get("Words", []):
            sentence_id = str(word.get("SentenceId") or word.get("sentenceId") or word.get("SentenceID") or word.get("Id") or uuid.uuid4().hex)
            key = (raw_speaker, sentence_id)
            start = _coerce_ms(word.get("Start") or word.get("start"))
            end = _coerce_ms(word.get("End") or word.get("end"))
            text = str(word.get("Text") or word.get("text") or "")
            if key not in sentence_map:
                sentence_map[key] = {
                    "speaker": raw_speaker,
                    "sentence_id": sentence_id,
                    "start": start,
                    "end": end,
                    "parts": [text],
                }
            else:
                sentence_map[key]["start"] = min(sentence_map[key]["start"], start)
                sentence_map[key]["end"] = max(sentence_map[key]["end"], end)
                sentence_map[key]["parts"].append(text)

    ordered_sentences = sorted(sentence_map.values(), key=lambda item: (item["start"], item["sentence_id"]))
    segments: list[dict] = []
    for sequence_id, sentence in enumerate(ordered_sentences):
        text = "".join(sentence["parts"]).strip()
        if not text:
            continue
        start = sentence["start"]
        end = max(sentence["end"], start)
        segment = DiarizedTranscriptSegment(
            id=uuid.uuid4().hex,
            text=text,
            timestamp=_format_timestamp_from_ms(start),
            source=speaker_map[sentence["speaker"]],
            is_partial=0,
            sequence_id=sequence_id,
            audio_start_time=round(start / 1000, 3),
            audio_end_time=round(end / 1000, 3),
            duration=round(max(end - start, 0) / 1000, 3),
        )
        segments.append(segment.model_dump())
    return segments


async def transcribe_file_with_tingwu(
    file_bytes: bytes,
    filename: str,
    public_base_url: str,
    source_language: str = "cn",
    language_hints: list[str] | None = None,
    client: TingwuClient | None = None,
) -> list[dict]:
    published = temp_media.publish_temp_media(file_bytes, filename, public_base_url)
    current_client = client or TingwuClient.from_env()
    try:
        task_id = await current_client.create_offline_task(
            file_url=published["url"],
            source_language=source_language,
            speaker_count=0,
            language_hints=language_hints,
        )
        task = await current_client.wait_for_offline_task(task_id)
        transcription_url = str(task.get("Data", {}).get("Result", {}).get("Transcription", "")).strip()
        if not transcription_url:
            raise RuntimeError("听悟文件任务缺少转写结果地址")
        payload = await current_client.fetch_json(transcription_url)
        return normalize_tingwu_transcription_payload(payload)
    finally:
        temp_media.delete_temp_media(published["token"])


def _coerce_ms(value) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _format_timestamp_from_ms(value: int) -> str:
    total_seconds = max(value, 0) // 1000
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"
