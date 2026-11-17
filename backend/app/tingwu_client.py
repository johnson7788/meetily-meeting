import asyncio
import json
import os
import uuid
from dataclasses import dataclass

import httpx
from aliyunsdkcore.client import AcsClient
from aliyunsdkcore.request import CommonRequest


class TingwuClientError(RuntimeError):
    pass


@dataclass(slots=True)
class TingwuConfig:
    access_key_id: str
    access_key_secret: str
    app_key: str
    region: str = 'cn-beijing'
    domain: str = 'tingwu.cn-beijing.aliyuncs.com'
    version: str = '2023-09-30'


class TingwuClient:
    def __init__(self, config: TingwuConfig):
        self._config = config
        self._client = AcsClient(config.access_key_id, config.access_key_secret, config.region)

    @classmethod
    def from_env(cls) -> 'TingwuClient':
        access_key_id = os.getenv('ALIBABA_CLOUD_ACCESS_KEY_ID', '').strip()
        access_key_secret = os.getenv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', '').strip()
        app_key = os.getenv('TINGWU_APP_KEY', '').strip()
        if not access_key_id or not access_key_secret or not app_key:
            raise TingwuClientError('听悟环境变量未配置完整')
        return cls(TingwuConfig(access_key_id=access_key_id, access_key_secret=access_key_secret, app_key=app_key))

    async def create_offline_task(
        self,
        *,
        file_url: str,
        source_language: str = 'cn',
        speaker_count: int = 0,
        language_hints: list[str] | None = None,
    ) -> str:
        transcription = {
            'DiarizationEnabled': True,
            'Diarization': {'SpeakerCount': speaker_count},
        }
        if language_hints:
            transcription['LanguageHints'] = language_hints
        payload = await asyncio.to_thread(
            self._do_request,
            'PUT',
            '/openapi/tingwu/v2/tasks',
            {
                'AppKey': self._config.app_key,
                'Input': {
                    'SourceLanguage': source_language,
                    'TaskKey': f'meeting-{uuid.uuid4().hex}',
                    'FileUrl': file_url,
                },
                'Parameters': {
                    'Transcription': transcription,
                },
            },
            {'type': 'offline'},
        )
        return str(payload['Data']['TaskId'])

    async def get_offline_task(self, task_id: str) -> dict:
        return await asyncio.to_thread(self._do_request, 'GET', f'/openapi/tingwu/v2/tasks/{task_id}', None, None)

    async def wait_for_offline_task(self, task_id: str, poll_interval_seconds: float = 1.0, max_attempts: int = 600) -> dict:
        for _ in range(max_attempts):
            payload = await self.get_offline_task(task_id)
            status = str(payload.get('Data', {}).get('TaskStatus', '')).upper()
            if status == 'COMPLETED':
                return payload
            if status in {'FAILED', 'ERROR', 'CANCELED', 'INVALID'}:
                raise TingwuClientError(payload.get('Message') or payload.get('ErrorMessage') or f'听悟文件任务失败: {status}')
            await asyncio.sleep(poll_interval_seconds)
        raise TingwuClientError('听悟文件任务超时')

    async def create_realtime_task(
        self,
        *,
        source_language: str = 'cn',
        audio_format: str = 'pcm',
        sample_rate: int = 16000,
        speaker_count: int = 0,
    ) -> dict:
        return await asyncio.to_thread(
            self._do_request,
            'PUT',
            '/openapi/tingwu/v2/tasks',
            {
                'AppKey': self._config.app_key,
                'Input': {
                    'SourceLanguage': source_language,
                    'TaskKey': f'meeting-{uuid.uuid4().hex}',
                    'Format': audio_format,
                    'SampleRate': sample_rate,
                },
                'Parameters': {
                    'Transcription': {
                        'DiarizationEnabled': True,
                        'Diarization': {'SpeakerCount': speaker_count},
                        'OutputLevel': 2,
                    }
                },
            },
            {'type': 'realtime'},
        )

    async def stop_realtime_task(self, meeting_id: str) -> dict:
        return await asyncio.to_thread(
            self._do_request,
            'PUT',
            '/openapi/tingwu/v2/tasks',
            {
                'AppKey': self._config.app_key,
                'Input': {'TaskId': meeting_id},
            },
            {'type': 'realtime', 'operation': 'stop'},
        )

    async def fetch_json(self, url: str) -> dict:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    def _do_request(self, method: str, uri: str, body: dict | None, query_params: dict | None) -> dict:
        request = CommonRequest()
        request.set_accept_format('json')
        request.set_domain(self._config.domain)
        request.set_version(self._config.version)
        request.set_protocol_type('https')
        request.set_method(method)
        request.set_uri_pattern(uri)
        request.add_header('Content-Type', 'application/json')
        for key, value in (query_params or {}).items():
            request.add_query_param(key, str(value))
        if body is not None:
            request.set_content(json.dumps(body).encode('utf-8'))
        response = self._client.do_action_with_exception(request)
        if isinstance(response, bytes):
            payload = json.loads(response.decode('utf-8'))
        elif isinstance(response, str):
            payload = json.loads(response)
        else:
            payload = response
        code = str(payload.get('Code', '0'))
        if code not in {'0', ''}:
            raise TingwuClientError(payload.get('Message') or payload.get('ErrorMessage') or f'听悟请求失败: {code}')
        return payload
