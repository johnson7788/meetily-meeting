import asyncio
import json
import threading
import uuid
from dataclasses import dataclass, field
from typing import Callable

import nls

from ..tingwu_client import TingwuClient


def _safe_json_loads(message: str) -> dict:
    try:
        return json.loads(message)
    except json.JSONDecodeError:
        return {}


def _extract_status(header: dict) -> int:
    raw = header.get("status", 20000000)
    try:
        return int(raw or 20000000)
    except (TypeError, ValueError):
        return 20000000


def _extract_message(header: dict, fallback: str) -> str:
    return str(header.get("status_text") or header.get("status_message") or fallback)


def _extract_body(payload: dict) -> dict:
    body = payload.get("payload")
    if isinstance(body, dict):
        return body
    return payload


def _extract_sequence_id(body: dict) -> int:
    raw = body.get("index") or body.get("sentence_index") or body.get("transSentenceIndex") or 0
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def _extract_partial_text(body: dict) -> str:
    return str(body.get("result") or body.get("transSentenceText") or "")


def _extract_final_text(body: dict) -> str:
    stash = body.get("stash_result") or body.get("stashResult") or {}
    stash_text = ""
    if isinstance(stash, dict):
        stash_text = str(stash.get("text") or stash.get("Text") or "")
    return f"{_extract_partial_text(body)}{stash_text}"


class TingwuRealtimeRuntime:
    def start(self, **kwargs) -> None:
        raise NotImplementedError

    def send_audio(self, chunk: bytes) -> None:
        raise NotImplementedError

    def stop(self) -> None:
        raise NotImplementedError

    def shutdown(self) -> None:
        raise NotImplementedError


class NlsRealtimeMeetingRuntime(TingwuRealtimeRuntime):
    def __init__(self, *, meeting_join_url: str, callbacks: dict[str, Callable[..., None]]):
        self._runtime = nls.NlsRealtimeMeeting(
            url=meeting_join_url,
            on_start=callbacks["on_start"],
            on_sentence_begin=callbacks["on_sentence_begin"],
            on_sentence_end=callbacks["on_sentence_end"],
            on_result_changed=callbacks["on_result_changed"],
            on_completed=callbacks["on_completed"],
            on_error=callbacks["on_error"],
            on_close=callbacks["on_close"],
        )

    def start(self, **kwargs) -> None:
        self._runtime.start(**kwargs)

    def send_audio(self, chunk: bytes) -> None:
        self._runtime.send_audio(chunk)

    def stop(self) -> None:
        self._runtime.stop()

    def shutdown(self) -> None:
        self._runtime.shutdown()


@dataclass(slots=True)
class TingwuRealtimeSession:
    meeting_id: str
    runtime: TingwuRealtimeRuntime
    client: TingwuClient
    event_queue: asyncio.Queue[dict] = field(default_factory=asyncio.Queue)
    loop: asyncio.AbstractEventLoop | None = None
    completion_timeout_seconds: float = 1.5
    terminal_event: asyncio.Event | None = None
    _terminal_sent: bool = False
    _terminal_lock: threading.Lock = field(default_factory=threading.Lock)

    def _emit_from_thread(self, event: dict) -> None:
        if self.loop is None:
            raise RuntimeError("事件循环未初始化")
        self.loop.call_soon_threadsafe(self.event_queue.put_nowait, event)

    def _mark_terminal_from_thread(self) -> bool:
        with self._terminal_lock:
            if self._terminal_sent:
                return False
            self._terminal_sent = True
        if self.loop is not None and self.terminal_event is not None:
            self.loop.call_soon_threadsafe(self.terminal_event.set)
        return True

    def _emit_terminal_from_thread(self, event: dict) -> None:
        if not self._mark_terminal_from_thread():
            return
        self._emit_from_thread(event)

    async def _wait_for_terminal(self) -> None:
        if self.terminal_event is None:
            return
        await self.terminal_event.wait()

    def handle_start(self, _message: str, *_args) -> None:
        return

    def handle_sentence_begin(self, _message: str, *_args) -> None:
        return

    def handle_result_changed(self, message: str, *_args) -> None:
        payload = _safe_json_loads(message)
        header = payload.get("header", {})
        if _extract_status(header) != 20000000:
            self._emit_terminal_from_thread({"type": "error", "message": _extract_message(header, "听悟实时识别失败")})
            return
        body = _extract_body(payload)
        text = _extract_partial_text(body)
        if not text.strip():
            return
        self._emit_from_thread({
            "type": "transcript",
            "text": text,
            "is_partial": True,
            "sequence_id": _extract_sequence_id(body),
        })

    def handle_sentence_end(self, message: str, *_args) -> None:
        payload = _safe_json_loads(message)
        header = payload.get("header", {})
        if _extract_status(header) != 20000000:
            self._emit_terminal_from_thread({"type": "error", "message": _extract_message(header, "听悟实时识别失败")})
            return
        body = _extract_body(payload)
        text = _extract_final_text(body)
        if not text.strip():
            return
        self._emit_from_thread({
            "type": "transcript",
            "text": text,
            "is_partial": False,
            "sequence_id": _extract_sequence_id(body),
        })

    def handle_completed(self, _message: str, *_args) -> None:
        self._emit_terminal_from_thread({"type": "done"})

    def handle_error(self, message: str, *_args) -> None:
        payload = _safe_json_loads(message)
        header = payload.get("header", {})
        self._emit_terminal_from_thread({"type": "error", "message": _extract_message(header, "实时转写连接中断，请重试。")})

    def handle_close(self, *_args) -> None:
        self._emit_terminal_from_thread({"type": "done"})

    async def send_audio(self, chunk: bytes) -> None:
        try:
            await asyncio.to_thread(self.runtime.send_audio, chunk)
        except Exception:
            return

    async def finish(self) -> None:
        try:
            await asyncio.to_thread(self.runtime.stop)
        except Exception:
            pass

        try:
            await asyncio.wait_for(self._wait_for_terminal(), timeout=self.completion_timeout_seconds)
        except asyncio.TimeoutError:
            self._emit_terminal_from_thread({"type": "done"})

        try:
            await asyncio.to_thread(self.runtime.shutdown)
        except Exception:
            pass
        await self.client.stop_realtime_task(self.meeting_id)

    async def close(self) -> None:
        try:
            await asyncio.to_thread(self.runtime.shutdown)
        except Exception:
            return

    async def receive_events(self):
        while True:
            event = await self.event_queue.get()
            yield event
            if event.get("type") in {"done", "error"}:
                break


def create_nls_realtime_runtime(*, meeting_join_url: str, callbacks: dict[str, Callable[..., None]]) -> TingwuRealtimeRuntime:
    return NlsRealtimeMeetingRuntime(meeting_join_url=meeting_join_url, callbacks=callbacks)


async def create_tingwu_realtime_session(
    client: TingwuClient | None = None,
    runtime_factory: Callable[..., TingwuRealtimeRuntime] | None = None,
    source_language: str = "cn",
    audio_format: str = "pcm",
    sample_rate: int = 16000,
) -> TingwuRealtimeSession:
    current_client = client or TingwuClient.from_env()
    payload = await current_client.create_realtime_task(
        source_language=source_language,
        audio_format=audio_format,
        sample_rate=sample_rate,
        speaker_count=0,
    )
    data = payload.get("Data", {})
    meeting_id = str(data.get("TaskId") or data.get("taskId") or data.get("MeetingId") or data.get("meetingId") or uuid.uuid4().hex)
    meeting_join_url = str(data.get("MeetingJoinUrl") or data.get("meetingJoinUrl") or "").strip()
    if not meeting_join_url:
        raise RuntimeError("听悟实时任务缺少推流地址")

    loop = asyncio.get_running_loop()
    session = TingwuRealtimeSession(
        meeting_id=meeting_id,
        runtime=None,
        client=current_client,
        loop=loop,
        terminal_event=asyncio.Event(),
    )  # type: ignore[arg-type]
    callbacks = {
        "on_start": session.handle_start,
        "on_sentence_begin": session.handle_sentence_begin,
        "on_sentence_end": session.handle_sentence_end,
        "on_result_changed": session.handle_result_changed,
        "on_completed": session.handle_completed,
        "on_error": session.handle_error,
        "on_close": session.handle_close,
    }
    current_runtime_factory = runtime_factory or create_nls_realtime_runtime
    runtime = current_runtime_factory(meeting_join_url=meeting_join_url, callbacks=callbacks)
    session.runtime = runtime
    await asyncio.to_thread(runtime.start, timeout=10, ping_interval=8, ping_timeout=None, ex=None)
    return session
