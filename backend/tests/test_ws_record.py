import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ws_record import handle_record_ws, send_heartbeats


class FakeWebSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


class FakeBrowserSocket:
    def __init__(self):
        self.client = ('127.0.0.1', 12345)
        self.accepted = False
        self.sent = []
        self._text_queue = [json.dumps({'action': 'start'})]
        self._receive_queue = [
            {'bytes': b'pcm-1'},
            {'text': json.dumps({'action': 'stop'})},
        ]

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        return self._text_queue.pop(0)

    async def receive(self):
        if not self._receive_queue:
            raise RuntimeError('no more messages')
        return self._receive_queue.pop(0)

    async def send_json(self, payload):
        self.sent.append(payload)


class FakeRealtimeSession:
    def __init__(self):
        self.audio_chunks = []
        self.finished = False
        self.closed = False

    async def send_audio(self, chunk: bytes):
        self.audio_chunks.append(chunk)

    async def finish(self):
        self.finished = True

    async def close(self):
        self.closed = True

    async def receive_events(self):
        yield {'type': 'transcript', 'text': '你好', 'is_partial': False, 'sequence_id': 1}
        yield {'type': 'done'}


async def _run_heartbeat_once():
    websocket = FakeWebSocket()
    task = asyncio.create_task(send_heartbeats(websocket, interval_seconds=0.01))

    await asyncio.sleep(0.03)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    return websocket.messages


def test_send_heartbeats_emits_heartbeat_messages():
    messages = asyncio.run(_run_heartbeat_once())
    assert messages
    assert messages[0] == {'type': 'heartbeat'}


def test_handle_record_ws_keeps_browser_protocol_stable(monkeypatch):
    browser = FakeBrowserSocket()
    session = FakeRealtimeSession()

    async def fake_create_session(*_args, **_kwargs):
        return session

    async def fake_send_heartbeats(*_args, **_kwargs):
        return None

    monkeypatch.setattr('app.ws_record.create_tingwu_realtime_session', fake_create_session)
    monkeypatch.setattr('app.ws_record.send_heartbeats', fake_send_heartbeats)

    asyncio.run(handle_record_ws(browser))

    assert browser.accepted is True
    assert session.audio_chunks == [b'pcm-1']
    assert session.finished is True
    assert session.closed is True
    assert browser.sent[0] == {'type': 'transcript', 'text': '你好', 'is_partial': False, 'sequence_id': 1}
    assert browser.sent[1] == {'type': 'done'}


def test_handle_record_ws_finishes_even_when_heartbeat_task_never_ends(monkeypatch):
    browser = FakeBrowserSocket()
    session = FakeRealtimeSession()

    async def fake_create_session(*_args, **_kwargs):
        return session

    async def fake_send_heartbeats(*_args, **_kwargs):
        await asyncio.Future()

    monkeypatch.setattr('app.ws_record.create_tingwu_realtime_session', fake_create_session)
    monkeypatch.setattr('app.ws_record.send_heartbeats', fake_send_heartbeats)

    asyncio.run(asyncio.wait_for(handle_record_ws(browser), timeout=0.2))

    assert browser.sent[-1] == {'type': 'done'}
