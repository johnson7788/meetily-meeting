import asyncio
import json

from app.services import tingwu_realtime_service


class FakeRuntime:
    def __init__(self, *, callbacks: dict[str, object]):
        self.callbacks = callbacks
        self.started = []
        self.sent_audio = []
        self.stop_calls = 0
        self.shutdown_calls = 0

    def start(self, **kwargs):
        self.started.append(kwargs)

    def send_audio(self, chunk: bytes):
        self.sent_audio.append(chunk)

    def stop(self):
        self.stop_calls += 1

    def shutdown(self):
        self.shutdown_calls += 1


async def _collect_events(session, trigger):
    events = []

    async def reader():
        async for event in session.receive_events():
            events.append(event)

    task = asyncio.create_task(reader())
    await asyncio.sleep(0)
    await trigger()
    await task
    return events


def test_create_realtime_session_uses_task_id_and_starts_sdk_runtime():
    calls = {}
    fake_runtime = None

    class FakeClient:
        async def create_realtime_task(self, *, source_language: str, audio_format: str, sample_rate: int, speaker_count: int):
            calls['create_realtime_task'] = {
                'source_language': source_language,
                'audio_format': audio_format,
                'sample_rate': sample_rate,
                'speaker_count': speaker_count,
            }
            return {
                'Data': {
                    'TaskId': 'task-1',
                    'MeetingJoinUrl': 'wss://tingwu.example.com/ws',
                }
            }

        async def stop_realtime_task(self, meeting_id: str):
            calls.setdefault('stop_realtime_task', []).append(meeting_id)

    def fake_runtime_factory(*, meeting_join_url: str, callbacks: dict[str, object]):
        nonlocal fake_runtime
        calls['meeting_join_url'] = meeting_join_url
        fake_runtime = FakeRuntime(callbacks=callbacks)
        return fake_runtime

    session = asyncio.run(
        tingwu_realtime_service.create_tingwu_realtime_session(
            client=FakeClient(),
            runtime_factory=fake_runtime_factory,
        )
    )

    assert calls['create_realtime_task']['speaker_count'] == 0
    assert calls['meeting_join_url'] == 'wss://tingwu.example.com/ws'
    assert fake_runtime.started == [{'timeout': 10, 'ping_interval': 8, 'ping_timeout': None, 'ex': None}]
    assert session.meeting_id == 'task-1'


def test_tingwu_realtime_session_maps_sdk_events_and_forwards_audio():
    calls = {}
    fake_runtime = None

    class FakeClient:
        async def create_realtime_task(self, *, source_language: str, audio_format: str, sample_rate: int, speaker_count: int):
            return {
                'Data': {
                    'TaskId': 'task-1',
                    'MeetingJoinUrl': 'wss://tingwu.example.com/ws',
                }
            }

        async def stop_realtime_task(self, meeting_id: str):
            calls.setdefault('stop_realtime_task', []).append(meeting_id)

    def fake_runtime_factory(*, meeting_join_url: str, callbacks: dict[str, object]):
        nonlocal fake_runtime
        fake_runtime = FakeRuntime(callbacks=callbacks)
        return fake_runtime

    async def scenario():
        session = await tingwu_realtime_service.create_tingwu_realtime_session(
            client=FakeClient(),
            runtime_factory=fake_runtime_factory,
        )
        await session.send_audio(b'pcm-chunk')

        async def trigger():
            fake_runtime.callbacks['on_result_changed'](json.dumps({
                'header': {'name': 'TranscriptionResultChanged', 'status': 20000000},
                'payload': {'index': 7, 'result': '第一句中间结果'},
            }))
            fake_runtime.callbacks['on_sentence_end'](json.dumps({
                'header': {'name': 'SentenceEnd', 'status': 20000000},
                'payload': {'index': 7, 'result': '第一句', 'stash_result': {'text': '结束'}},
            }))
            fake_runtime.callbacks['on_completed'](json.dumps({
                'header': {'name': 'TranscriptionCompleted', 'status': 20000000},
                'payload': {},
            }))

        events = await _collect_events(session, trigger)
        await session.finish()
        await session.close()
        return session, events

    session, events = asyncio.run(scenario())

    assert fake_runtime.sent_audio == [b'pcm-chunk']
    assert events == [
        {'type': 'transcript', 'text': '第一句中间结果', 'is_partial': True, 'sequence_id': 7},
        {'type': 'transcript', 'text': '第一句结束', 'is_partial': False, 'sequence_id': 7},
        {'type': 'done'},
    ]
    assert fake_runtime.stop_calls == 1
    assert fake_runtime.shutdown_calls == 2
    assert calls['stop_realtime_task'] == ['task-1']
    assert session.meeting_id == 'task-1'


def test_tingwu_realtime_session_waits_for_late_completion_after_stop():
    calls = {}
    fake_runtime = None

    class FakeClient:
        async def create_realtime_task(self, *, source_language: str, audio_format: str, sample_rate: int, speaker_count: int):
            return {
                'Data': {
                    'TaskId': 'task-1',
                    'MeetingJoinUrl': 'wss://tingwu.example.com/ws',
                }
            }

        async def stop_realtime_task(self, meeting_id: str):
            calls.setdefault('stop_realtime_task', []).append(meeting_id)

    def fake_runtime_factory(*, meeting_join_url: str, callbacks: dict[str, object]):
        nonlocal fake_runtime
        fake_runtime = FakeRuntime(callbacks=callbacks)
        return fake_runtime

    async def scenario():
        session = await tingwu_realtime_service.create_tingwu_realtime_session(
            client=FakeClient(),
            runtime_factory=fake_runtime_factory,
        )
        events = []

        async def reader():
            async for event in session.receive_events():
                events.append(event)

        reader_task = asyncio.create_task(reader())

        async def late_completed():
            await asyncio.sleep(0.05)
            fake_runtime.callbacks['on_sentence_end'](json.dumps({
                'header': {'name': 'SentenceEnd', 'status': 20000000},
                'payload': {'index': 9, 'result': '最终句子'},
            }))
            fake_runtime.callbacks['on_completed'](json.dumps({
                'header': {'name': 'TranscriptionCompleted', 'status': 20000000},
                'payload': {},
            }))

        late_task = asyncio.create_task(late_completed())
        await session.finish()
        await late_task
        await reader_task
        await session.close()
        return events

    events = asyncio.run(scenario())

    assert events == [
        {'type': 'transcript', 'text': '最终句子', 'is_partial': False, 'sequence_id': 9},
        {'type': 'done'},
    ]
    assert fake_runtime.stop_calls == 1
    assert calls['stop_realtime_task'] == ['task-1']


def test_tingwu_realtime_session_emits_done_after_stop_timeout():
    class FakeClient:
        async def create_realtime_task(self, *, source_language: str, audio_format: str, sample_rate: int, speaker_count: int):
            return {
                'Data': {
                    'TaskId': 'task-1',
                    'MeetingJoinUrl': 'wss://tingwu.example.com/ws',
                }
            }

        async def stop_realtime_task(self, meeting_id: str):
            return None

    fake_runtime = None

    def fake_runtime_factory(*, meeting_join_url: str, callbacks: dict[str, object]):
        nonlocal fake_runtime
        fake_runtime = FakeRuntime(callbacks=callbacks)
        return fake_runtime

    async def scenario():
        session = await tingwu_realtime_service.create_tingwu_realtime_session(
            client=FakeClient(),
            runtime_factory=fake_runtime_factory,
        )
        session.completion_timeout_seconds = 0.01
        events = []

        async def reader():
            async for event in session.receive_events():
                events.append(event)

        reader_task = asyncio.create_task(reader())
        await session.finish()
        await reader_task
        await session.close()
        return events

    assert asyncio.run(scenario()) == [{'type': 'done'}]


def test_tingwu_realtime_session_maps_sdk_error_to_friendly_error():
    class FakeClient:
        async def create_realtime_task(self, *, source_language: str, audio_format: str, sample_rate: int, speaker_count: int):
            return {
                'Data': {
                    'TaskId': 'task-1',
                    'MeetingJoinUrl': 'wss://tingwu.example.com/ws',
                }
            }

        async def stop_realtime_task(self, meeting_id: str):
            return None

    fake_runtime = None

    def fake_runtime_factory(*, meeting_join_url: str, callbacks: dict[str, object]):
        nonlocal fake_runtime
        fake_runtime = FakeRuntime(callbacks=callbacks)
        return fake_runtime

    async def scenario():
        session = await tingwu_realtime_service.create_tingwu_realtime_session(
            client=FakeClient(),
            runtime_factory=fake_runtime_factory,
        )

        async def trigger():
            fake_runtime.callbacks['on_error'](json.dumps({
                'header': {'status_text': 'Gateway timeout'},
            }))

        return await _collect_events(session, trigger)

    assert asyncio.run(scenario()) == [{'type': 'error', 'message': 'Gateway timeout'}]
