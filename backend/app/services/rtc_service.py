import os

from livekit.api import AccessToken, VideoGrants

from ..models import RealtimeJoinGrantPayload


def _require_env(name: str, error_message: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(error_message)
    return value


def _issue_livekit_join_grant(
    room_id: str,
    participant_name: str,
    participant_identity: str,
) -> RealtimeJoinGrantPayload:
    server_url = _require_env("MEETILY_RTC_SERVER_URL", "缺少 RTC 服务地址")
    api_key = _require_env("LIVEKIT_API_KEY", "缺少 LiveKit API Key")
    api_secret = _require_env("LIVEKIT_API_SECRET", "缺少 LiveKit API Secret")
    token = (
        AccessToken(api_key, api_secret)
        .with_identity(participant_identity)
        .with_name(participant_name)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room_id,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
    return RealtimeJoinGrantPayload(
        provider="livekit",
        server_url=server_url,
        token=token,
        room_name=room_id,
        participant_name=participant_name,
        participant_identity=participant_identity,
    )


def issue_join_grant(
    room_id: str,
    participant_name: str,
    participant_identity: str | None = None,
) -> RealtimeJoinGrantPayload:
    normalized_room_id = room_id.strip()
    normalized_participant_name = participant_name.strip()
    normalized_participant_identity = (participant_identity or "").strip()
    if not normalized_room_id:
        raise ValueError("缺少房间标识")
    if not normalized_participant_name:
        raise ValueError("缺少参会者名称")
    if not normalized_participant_identity:
        raise ValueError("缺少稳定 participant identity")
    return _issue_livekit_join_grant(
        room_id=normalized_room_id,
        participant_name=normalized_participant_name,
        participant_identity=normalized_participant_identity,
    )
