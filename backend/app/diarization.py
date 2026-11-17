import os
import uuid
from typing import Iterable

import httpx

_DASHSCOPE_BASE = "https://dashscope.aliyuncs.com"
_POLL_INTERVAL_SECONDS = 0.5
_POLL_MAX_ATTEMPTS = 120
_FRAGMENT_MAX_TURNS = 1
_FRAGMENT_MAX_SECONDS = 6.0
_STABLE_MIN_TURNS = 2
_STABLE_MIN_SECONDS = 8.0


def _format_timestamp_from_ms(value: int) -> str:
    total_seconds = max(value, 0) // 1000
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"


def _coerce_ms(value) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value * 1000)) if value < 1000 else int(round(value))
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _sort_key(item: dict, index: int) -> tuple:
    begin_time = item.get("begin_time")
    if begin_time is not None:
        return (0, _coerce_ms(begin_time), index)

    audio_start_time = item.get("audio_start_time")
    if audio_start_time is not None:
        return (1, _coerce_ms(audio_start_time), index)

    sequence_id = item.get("sequence_id")
    if sequence_id is not None:
        return (2, _coerce_ms(sequence_id), index)

    timestamp = item.get("timestamp")
    if timestamp:
        return (3, str(timestamp), index)

    return (4, index)


def _segment_duration(segment: dict) -> float:
    start = segment.get("audio_start_time")
    end = segment.get("audio_end_time")
    if start is not None and end is not None:
        return max(float(end) - float(start), 0.0)
    duration = segment.get("duration")
    if duration is not None:
        return max(float(duration), 0.0)
    return 0.0


def _source_stats(segments: list[dict]) -> dict[str, dict[str, float]]:
    stats: dict[str, dict[str, float]] = {}
    for segment in segments:
        source = str(segment.get("source") or "")
        if not source:
            continue
        current = stats.setdefault(source, {"turns": 0, "seconds": 0.0})
        current["turns"] += 1
        current["seconds"] += _segment_duration(segment)
    return stats


def _segment_gap(left: dict, right: dict) -> float:
    left_start = float(left.get("audio_start_time") or 0)
    left_end = float(left.get("audio_end_time") or left_start)
    right_start = float(right.get("audio_start_time") or 0)
    right_end = float(right.get("audio_end_time") or right_start)
    if left_end < right_start:
        return right_start - left_end
    if right_end < left_start:
        return left_start - right_end
    return 0.0


def _nearest_stable_source(index: int, segments: list[dict], stable_sources: set[str]) -> str | None:
    current = segments[index]
    best: tuple[float, int, str] | None = None
    for candidate_index, candidate in enumerate(segments):
        source = str(candidate.get("source") or "")
        if candidate_index == index or source not in stable_sources:
            continue
        rank = (_segment_gap(current, candidate), abs(candidate_index - index), source)
        if best is None or rank < best:
            best = rank
    return best[2] if best else None


def _compact_speaker_sources(segments: list[dict]) -> list[dict]:
    source_map: dict[str, str] = {}
    for segment in segments:
        source = str(segment.get("source") or "")
        if not source:
            continue
        if source not in source_map:
            source_map[source] = f"speaker_{len(source_map) + 1}"
        segment["source"] = source_map[source]
    return segments


def _merge_short_speaker_fragments(segments: list[dict]) -> list[dict]:
    stats = _source_stats(segments)
    stable_sources = {
        source
        for source, item in stats.items()
        if item["turns"] >= _STABLE_MIN_TURNS or item["seconds"] >= _STABLE_MIN_SECONDS
    }
    if len(stable_sources) < 2:
        return _compact_speaker_sources(segments)

    fragment_sources = {
        source
        for source, item in stats.items()
        if item["turns"] <= _FRAGMENT_MAX_TURNS and item["seconds"] <= _FRAGMENT_MAX_SECONDS
    }
    if not fragment_sources:
        return _compact_speaker_sources(segments)

    for index, segment in enumerate(segments):
        source = str(segment.get("source") or "")
        if source not in fragment_sources:
            continue
        replacement = _nearest_stable_source(index, segments, stable_sources)
        if replacement:
            segment["source"] = replacement

    return _compact_speaker_sources(segments)


def normalize_diarized_sentences(sentences: Iterable[dict]) -> list[dict]:
    ordered = sorted(
        [(item, index) for index, item in enumerate(sentences)],
        key=lambda pair: _sort_key(pair[0], pair[1]),
    )

    speaker_map: dict[object, str] = {}
    segments: list[dict] = []

    for sequence_id, (sentence, _) in enumerate(ordered):
        text = str(sentence.get("text", "")).strip()
        if not text:
            continue

        if sentence.get("speaker_id") is not None:
            raw_speaker = int(sentence.get("speaker_id", 0))
        elif sentence.get("source"):
            raw_speaker = str(sentence.get("source"))
        else:
            raw_speaker = sequence_id

        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"speaker_{len(speaker_map) + 1}"

        begin_time = _coerce_ms(sentence.get("begin_time"))
        audio_start_time = sentence.get("audio_start_time")
        if audio_start_time is not None:
            begin_time = _coerce_ms(audio_start_time)

        end_time = _coerce_ms(sentence.get("end_time"))
        audio_end_time = sentence.get("audio_end_time")
        if audio_end_time is not None:
            end_time = _coerce_ms(audio_end_time)
        if end_time < begin_time:
            end_time = begin_time

        payload = dict(sentence)
        payload["id"] = sentence.get("id") or uuid.uuid4().hex
        payload["text"] = text
        payload["timestamp"] = sentence.get("timestamp") or _format_timestamp_from_ms(begin_time)
        payload["source"] = speaker_map[raw_speaker]
        payload["is_partial"] = 0
        payload["sequence_id"] = sequence_id
        payload["audio_start_time"] = round(begin_time / 1000, 3) if begin_time else payload.get("audio_start_time")
        payload["audio_end_time"] = round(end_time / 1000, 3) if end_time else payload.get("audio_end_time")
        if payload.get("audio_start_time") is not None and payload.get("audio_end_time") is not None:
            payload["duration"] = round(max(payload["audio_end_time"] - payload["audio_start_time"], 0), 3)
        else:
            payload["duration"] = payload.get("duration")
        segments.append(payload)

    return _merge_short_speaker_fragments(segments)


async def transcribe_audio_with_diarization(
    file_bytes: bytes,
    filename: str,
    api_key: str,
    language_hints: list[str] | None = None,
) -> list[dict]:
    hints = language_hints or ["zh", "en"]
    timeout = httpx.Timeout(30.0, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        policy = await _get_upload_policy(client, api_key)
        file_url = await _upload_file(client, policy, file_bytes, filename)
        task_id = await _submit_transcription_task(client, api_key, file_url, hints)
        transcription_url = await _poll_transcription_task(client, api_key, task_id)
        sentences = await _fetch_transcription_result(client, transcription_url)
        return normalize_diarized_sentences(sentences)


async def transcribe_audio_without_diarization(
    file_bytes: bytes,
    filename: str,
    api_key: str,
    language_hints: list[str] | None = None,
) -> str:
    hints = language_hints or ["zh", "en"]
    timeout = httpx.Timeout(30.0, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        policy = await _get_upload_policy(client, api_key)
        file_url = await _upload_file(client, policy, file_bytes, filename)
        task_id = await _submit_transcription_task(
            client,
            api_key,
            file_url,
            hints,
            diarization_enabled=False,
        )
        transcription_url = await _poll_transcription_task(client, api_key, task_id)
        sentences = await _fetch_transcription_result(client, transcription_url)
        return "\n".join(str(sentence.get("text", "")).strip() for sentence in sentences if str(sentence.get("text", "")).strip())


async def _get_upload_policy(client: httpx.AsyncClient, api_key: str) -> dict:
    response = await client.get(
        f"{_DASHSCOPE_BASE}/api/v1/uploads",
        params={"action": "getPolicy", "model": "paraformer-v2"},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    response.raise_for_status()
    return response.json()["data"]


async def _upload_file(client: httpx.AsyncClient, policy: dict, file_bytes: bytes, filename: str) -> str:
    extension = os.path.splitext(filename)[1] or ".wav"
    object_key = f"{policy['upload_dir']}/{uuid.uuid4().hex}{extension}"
    form_data = {
        "OSSAccessKeyId": policy["oss_access_key_id"],
        "policy": policy["policy"],
        "Signature": policy["signature"],
        "key": object_key,
        "x-oss-object-acl": policy["x_oss_object_acl"],
        "x-oss-forbid-overwrite": policy["x_oss_forbid_overwrite"],
        "success_action_status": "200",
    }
    security_token = policy.get("x_oss_security_token")
    if security_token:
        form_data["x-oss-security-token"] = security_token

    response = await client.post(
        policy["upload_host"],
        data=form_data,
        files={"file": (filename, file_bytes)},
    )
    response.raise_for_status()
    return f"oss://{object_key}"


async def _submit_transcription_task(
    client: httpx.AsyncClient,
    api_key: str,
    file_url: str,
    language_hints: list[str],
    diarization_enabled: bool = True,
) -> str:
    parameters = {
        "language_hints": language_hints,
        "punctuation_prediction": True,
        "sentence_detection": True,
        "diarization_enabled": diarization_enabled,
    }
    if diarization_enabled:
        parameters["speaker_count"] = 0

    response = await client.post(
        f"{_DASHSCOPE_BASE}/api/v1/services/audio/asr/transcription",
        headers={
            "Authorization": f"Bearer {api_key}",
            "X-DashScope-Async": "enable",
            "X-DashScope-OssResourceResolve": "enable",
        },
        json={
            "model": "paraformer-v2",
            "input": {"file_urls": [file_url]},
            "parameters": parameters,
        },
    )
    response.raise_for_status()
    return response.json()["output"]["task_id"]


async def _poll_transcription_task(client: httpx.AsyncClient, api_key: str, task_id: str) -> str:
    for _ in range(_POLL_MAX_ATTEMPTS):
        response = await client.get(
            f"{_DASHSCOPE_BASE}/api/v1/tasks/{task_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        response.raise_for_status()
        output = response.json()["output"]
        task_status = output["task_status"]

        if task_status == "SUCCEEDED":
            results = output.get("results", [])
            if not results:
                raise RuntimeError("说话人分离任务成功但无结果")
            transcription_url = results[0].get("transcription_url")
            if not transcription_url:
                raise RuntimeError("说话人分离任务成功但缺少结果地址")
            return transcription_url
        if task_status in {"FAILED", "CANCELED"}:
            raise RuntimeError(output.get("message") or output.get("code") or f"任务状态异常: {task_status}")

        await _sleep()

    raise RuntimeError("说话人分离任务超时")


async def _fetch_transcription_result(client: httpx.AsyncClient, transcription_url: str) -> list[dict]:
    response = await client.get(transcription_url)
    response.raise_for_status()
    payload = response.json()

    sentences: list[dict] = []
    for transcript in payload.get("transcripts", []):
        for sentence in transcript.get("sentences", []):
            if str(sentence.get("text", "")).strip():
                sentences.append(sentence)

    return sorted(sentences, key=lambda item: item.get("begin_time", 0))


async def _sleep():
    import asyncio

    await asyncio.sleep(_POLL_INTERVAL_SECONDS)
