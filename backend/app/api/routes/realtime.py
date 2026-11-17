from fastapi import APIRouter, Depends

from ...api.deps.auth import CurrentUser, get_current_user
from ...models import RealtimeSummaryRequest
from ...services import summary_service
from ...config import get_llm_api_key, get_llm_model, get_llm_provider

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.post("/summarize")
async def realtime_summarize(
    req: RealtimeSummaryRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    provider = get_llm_provider()
    model = get_llm_model()
    api_key = get_llm_api_key()
    if not api_key:
        return {"summary": "未配置 LLM API Key，无法生成摘要。", "ok": False}
    try:
        summary = await summary_service.generate_incremental_summary(
            req.transcript, provider, model, api_key, req.notes,
        )
        return {"summary": summary, "ok": True}
    except Exception as exc:
        return {"summary": f"摘要生成失败：{exc}", "ok": False}
