import asyncio
import json
import logging
import struct
from fastapi import WebSocket, WebSocketDisconnect

from .services.tingwu_realtime_service import create_tingwu_realtime_session

logger = logging.getLogger("meetily.ws")


def _describe_pcm_chunk(chunk: bytes) -> str:
    if not chunk:
        return "bytes=0 samples=0 peak=0 avg=0 silent=true"

    sample_count = len(chunk) // 2
    if sample_count <= 0:
        return f"bytes={len(chunk)} samples=0 peak=0 avg=0 silent=true"

    samples = struct.unpack(f"<{sample_count}h", chunk[: sample_count * 2])
    peak = max(abs(sample) for sample in samples)
    avg = sum(abs(sample) for sample in samples) // sample_count
    silent = peak == 0
    return f"bytes={len(chunk)} samples={sample_count} peak={peak} avg={avg} silent={str(silent).lower()}"


async def send_heartbeats(websocket: WebSocket, done: asyncio.Event, interval_seconds: float = 15.0):
    while not done.is_set():
        await asyncio.sleep(interval_seconds)
        if done.is_set():
            break
        try:
            await websocket.send_json({"type": "heartbeat"})
        except Exception:
            break


async def handle_record_ws(websocket: WebSocket):
    await websocket.accept()
    client = websocket.client
    logger.info("WS 连接建立 client=%s", client)
    session = None

    try:
        init_raw = await websocket.receive_text()
        init = json.loads(init_raw)
        if init.get("action") != "start":
            await websocket.send_json({"type": "error", "message": "期望 start 消息"})
            return

        source_language = init.get("source_language") or "cn"
        session = await create_tingwu_realtime_session(source_language=source_language)
        audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        audio_frames = 0
        done = asyncio.Event()

        async def receive_from_browser():
            nonlocal audio_frames
            try:
                while not done.is_set():
                    msg = await websocket.receive()
                    if "bytes" in msg:
                        audio_frames += 1
                        chunk = msg["bytes"]
                        if audio_frames <= 5 or audio_frames % 50 == 0:
                            logger.info("PCM 帧[%d] %s", audio_frames, _describe_pcm_chunk(chunk))
                        await audio_queue.put(chunk)
                    elif "text" in msg:
                        data = json.loads(msg["text"])
                        if data.get("action") == "stop":
                            logger.info("收到 stop，共 %d 帧音频", audio_frames)
                            await audio_queue.put(None)
                            break
            except WebSocketDisconnect:
                logger.info("浏览器断开连接，共 %d 帧音频", audio_frames)
                await audio_queue.put(None)
            finally:
                done.set()

        async def forward_audio():
            try:
                while not done.is_set():
                    chunk = await audio_queue.get()
                    if chunk is None:
                        await session.finish()
                        break
                    await session.send_audio(chunk)
            except Exception:
                done.set()

        async def forward_events():
            try:
                async for event in session.receive_events():
                    if done.is_set():
                        break
                    await websocket.send_json(event)
            except Exception:
                pass
            finally:
                done.set()

        async def keep_alive():
            try:
                await send_heartbeats(websocket, done)
            except Exception:
                pass

        heartbeat_task = asyncio.create_task(keep_alive())
        try:
            await asyncio.gather(
                receive_from_browser(),
                forward_audio(),
                forward_events(),
            )
        finally:
            done.set()
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    except WebSocketDisconnect:
        logger.info("WS 正常断开")
    except BaseException as exc:
        if isinstance(exc, ExceptionGroup):
            message = "; ".join(str(item) for item in exc.exceptions)
        else:
            message = str(exc)
        logger.error("WS 异常: %s", message)
        try:
            await websocket.send_json({"type": "error", "message": message})
        except Exception:
            pass
    finally:
        if session is not None:
            await session.close()
        logger.info("WS 会话结束")
