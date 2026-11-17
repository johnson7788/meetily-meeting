import json
import asyncio

import pytest

from app.tingwu_client import TingwuClient, TingwuClientError, TingwuConfig


class FakeCommonRequest:
    def __init__(self):
        self.accept_format = None
        self.domain = None
        self.version = None
        self.protocol_type = None
        self.method = None
        self.uri_pattern = None
        self.headers = {}
        self.query_params = {}
        self.content = None

    def set_accept_format(self, value):
        self.accept_format = value

    def set_domain(self, value):
        self.domain = value

    def set_version(self, value):
        self.version = value

    def set_protocol_type(self, value):
        self.protocol_type = value

    def set_method(self, value):
        self.method = value

    def set_uri_pattern(self, value):
        self.uri_pattern = value

    def add_header(self, key, value):
        self.headers[key] = value

    def add_query_param(self, key, value):
        self.query_params[key] = value

    def set_content(self, value):
        self.content = value


class FakeAcsClient:
    def __init__(self, payloads=None):
        self.requests = []
        self.payloads = list(payloads or [json.dumps({'Code': '0', 'Data': {'TaskId': 'task-1'}}).encode('utf-8')])

    def do_action_with_exception(self, request):
        self.requests.append(request)
        return self.payloads.pop(0)


@pytest.fixture
def tingwu_client(monkeypatch):
    fake_acs_client = FakeAcsClient()
    fake_requests = []

    def fake_common_request():
        request = FakeCommonRequest()
        fake_requests.append(request)
        return request

    monkeypatch.setattr('app.tingwu_client.CommonRequest', fake_common_request)

    client = TingwuClient(TingwuConfig(access_key_id='ak', access_key_secret='sk', app_key='app'))
    client._client = fake_acs_client
    return client, fake_requests


def test_do_request_uses_roa_query_params(tingwu_client):
    client, fake_requests = tingwu_client

    payload = client._do_request(
        'PUT',
        '/openapi/tingwu/v2/tasks',
        {'AppKey': 'app'},
        {'type': 'offline', 'operation': 'start'},
    )

    assert payload['Data']['TaskId'] == 'task-1'
    request = fake_requests[0]
    assert request.query_params == {'type': 'offline', 'operation': 'start'}
    assert request.protocol_type == 'https'
    assert request.method == 'PUT'
    assert request.uri_pattern == '/openapi/tingwu/v2/tasks'


def test_stop_realtime_task_uses_realtime_stop_request(monkeypatch):
    fake_acs_client = FakeAcsClient(payloads=[json.dumps({'Code': '0', 'Data': {'TaskId': 'task-9'}}).encode('utf-8')])
    fake_requests = []

    def fake_common_request():
        request = FakeCommonRequest()
        fake_requests.append(request)
        return request

    monkeypatch.setattr('app.tingwu_client.CommonRequest', fake_common_request)

    client = TingwuClient(TingwuConfig(access_key_id='ak', access_key_secret='sk', app_key='app'))
    client._client = fake_acs_client

    payload = asyncio.run(client.stop_realtime_task('task-9'))

    assert payload['Data']['TaskId'] == 'task-9'
    request = fake_requests[0]
    assert request.query_params == {'type': 'realtime', 'operation': 'stop'}
    assert json.loads(request.content.decode('utf-8')) == {
        'AppKey': 'app',
        'Input': {'TaskId': 'task-9'},
    }


def test_create_realtime_task_sets_output_level_two(monkeypatch):
    fake_acs_client = FakeAcsClient(payloads=[json.dumps({'Code': '0', 'Data': {'TaskId': 'task-3'}}).encode('utf-8')])
    fake_requests = []

    def fake_common_request():
        request = FakeCommonRequest()
        fake_requests.append(request)
        return request

    monkeypatch.setattr('app.tingwu_client.CommonRequest', fake_common_request)

    client = TingwuClient(TingwuConfig(access_key_id='ak', access_key_secret='sk', app_key='app'))
    client._client = fake_acs_client

    payload = asyncio.run(client.create_realtime_task(source_language='cn', audio_format='pcm', sample_rate=16000, speaker_count=0))

    assert payload['Data']['TaskId'] == 'task-3'
    request = fake_requests[0]
    body = json.loads(request.content.decode('utf-8'))
    assert body['Parameters']['Transcription']['OutputLevel'] == 2
    assert 'AdditionalStreamOutputLevel' not in body['Parameters']['Transcription']


def test_do_request_raises_tingwu_error_on_nonzero_code(monkeypatch):
    fake_acs_client = FakeAcsClient(payloads=[json.dumps({'Code': '400', 'Message': 'bad request'}).encode('utf-8')])

    def fake_common_request():
        return FakeCommonRequest()

    monkeypatch.setattr('app.tingwu_client.CommonRequest', fake_common_request)

    client = TingwuClient(TingwuConfig(access_key_id='ak', access_key_secret='sk', app_key='app'))
    client._client = fake_acs_client

    with pytest.raises(TingwuClientError, match='bad request'):
        client._do_request('GET', '/openapi/tingwu/v2/tasks/task-1', None, None)
