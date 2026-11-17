import asyncio
import json
import logging
import uuid
from typing import AsyncIterator
import websockets

logger = logging.getLogger("meetily.asr")

DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"

class DashScopeASR:
    """
    DashScope Realtime ASR 客户端
    通过 async generator 接收转写事件
    """
    def __init__(self, api_key: str, hot_words: str = ""):
        self.api_key = api_key
        self.hot_words = hot_words  # 竖线分隔，如 "阿莫西林|高血压|心肌梗死"
        self.task_id = str(uuid.uuid4()).replace("-", "")
        self._ws = None

    async def connect(self):
        logger.info("连接 DashScope WebSocket task_id=%s", self.task_id)
        headers = {"Authorization": f"bearer {self.api_key}"}
        self._ws = await websockets.connect(
            DASHSCOPE_WS_URL,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=10,
        )
        logger.info("WebSocket 握手成功，发送 run-task")
        run_task_msg = json.dumps({
            "header": {
                "action": "run-task",
                "task_id": self.task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": "paraformer-realtime-v2",
                "parameters": {
                    "sample_rate": 16000,
                    "format": "pcm",
                    "language_hints": ["zh", "en"],
                    "diarization_enabled": True,
                    "speaker_count": 0,
                    **({"hot_words": self.hot_words} if self.hot_words else {}),
                },
                "input": {},
            },
        })
        logger.info("run-task payload: %s", run_task_msg)
        await self._ws.send(run_task_msg)
        msg = await self._ws.recv()
        data = json.loads(msg)
        if data.get("header", {}).get("event") != "task-started":
            logger.error("DashScope run-task 失败: %s", msg)
            raise RuntimeError(f"DashScope run-task 失败: {msg}")
        logger.info("DashScope task-started OK")

    async def send_audio(self, pcm_bytes: bytes):
        if self._ws:
            await self._ws.send(pcm_bytes)

    async def finish(self):
        if self._ws:
            await self._ws.send(json.dumps({
                "header": {
                    "action": "finish-task",
                    "task_id": self.task_id,
                    "streaming": "duplex",
                },
                "payload": {"input": {}},
            }))

    async def receive_events(self) -> AsyncIterator[dict]:
        """
        迭代接收转写事件，直到 task-finished
        yield: {"type": "transcript", "text": str, "is_partial": bool, "sequence_id": int}
               {"type": "done"}
               {"type": "error", "message": str}
        """
        seq = 0
        async for raw in self._ws:
            if not isinstance(raw, str):
                continue  # 跳过二进制帧（心跳等）
            data = json.loads(raw)
            event = data.get("header", {}).get("event", "")
            if event == "result-generated":
                output = data.get("payload", {}).get("output", {})
                sentence = output.get("sentence", {})
                text = sentence.get("text", "")
                is_end = sentence.get("sentence_end", False)
                logger.info(
                    "DashScope result-generated text_len=%d sentence_end=%s payload_keys=%s",
                    len(text),
                    is_end,
                    list(output.keys()),
                )
                if not text:
                    logger.info("DashScope 空转写片段: %s", json.dumps(sentence, ensure_ascii=False))
                if text:
                    yield {
                        "type": "transcript",
                        "text": text,
                        "is_partial": not is_end,
                        "sequence_id": seq,
                    }
                    if is_end:
                        seq += 1
            elif event == "task-finished":
                yield {"type": "done"}
                break
            elif event == "task-failed":
                error = data.get("header", {}).get("error_message", "未知错误")
                yield {"type": "error", "message": error}
                break

    async def close(self):
        if self._ws:
            logger.info("关闭 DashScope 连接 task_id=%s", self.task_id)
            await self._ws.close()
            self._ws = None
