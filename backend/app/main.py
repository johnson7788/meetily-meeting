import logging
from contextlib import asynccontextmanager

import uuid
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.meetings import router as meetings_router
from .api.routes.realtime import router as realtime_router
from .repositories.db import init_db
from .repositories.templates import (
    create_template,
    delete_template,
    get_all_templates,
    get_template,
    update_template,
)
from .models import TemplateRequest
from .services import meeting_service
from . import temp_media
from .ws_record import handle_record_ws

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("meetily")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("后端启动，初始化数据库...")
    await init_db()
    await meeting_service.seed_default_templates(get_all_templates, create_template)
    logger.info("数据库就绪，监听 :5167")
    yield
    logger.info("后端关闭")


app = FastAPI(title="Meetily API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings_router)
app.include_router(realtime_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/templates")
async def list_templates():
    return await get_all_templates()


@app.post("/api/templates")
async def add_template(req: TemplateRequest):
    template_id = uuid.uuid4().hex
    template = await create_template(template_id, req.name, req.content)
    logger.info("POST /api/templates → %s", req.name)
    return template


@app.put("/api/templates/{template_id}")
async def edit_template(template_id: str, req: TemplateRequest):
    template = await get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await update_template(template_id, req.name, req.content)
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
async def remove_template(template_id: str):
    await delete_template(template_id)
    logger.info("DELETE /api/templates/%s", template_id)
    return {"ok": True}


@app.get("/api/internal/temp-media/{token}/{filename}")
async def get_temp_media(token: str, filename: str):
    try:
        metadata = temp_media.resolve_temp_media(token)
    except temp_media.TempMediaExpiredError as exc:
        raise HTTPException(status_code=410, detail="临时媒体已过期") from exc
    except temp_media.TempMediaNotFoundError as exc:
        raise HTTPException(status_code=404, detail="临时媒体不存在") from exc

    if metadata.get("filename") != filename:
        raise HTTPException(status_code=404, detail="临时媒体不存在")

    return FileResponse(path=metadata["path"], media_type=metadata.get("content_type"), filename=metadata.get("filename"))


@app.websocket("/ws/record")
async def ws_record(websocket: WebSocket):
    await handle_record_ws(websocket)
