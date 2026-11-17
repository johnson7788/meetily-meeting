import asyncio
import json
import os
import uuid
import websockets

API_KEY = os.getenv("LLM_API_KEY", "sk-xxx")
URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"

async def main():
    task_id = uuid.uuid4().hex
    headers = {"Authorization": f"bearer {API_KEY}"}

    print(f"连接 DashScope...")
    async with websockets.connect(URL, additional_headers=headers) as ws:
        msg = json.dumps({
            "header": {
                "action": "run-task",
                "task_id": task_id,
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
                },
                "input": {},
            },
        })
        print(f"发送 run-task: {msg}")
        await ws.send(msg)

        resp = await ws.recv()
        print(f"收到响应: {resp}")
if __name__ == "__main__":
    asyncio.run(main())
