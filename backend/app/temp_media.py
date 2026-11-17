import json
import mimetypes
import os
import shutil
import time
import uuid
from pathlib import Path
from urllib.parse import quote

TEMP_MEDIA_ROOT = Path(os.getenv("MEETILY_TEMP_MEDIA_DIR", str(Path(__file__).resolve().parents[1] / ".temp-media")))


class TempMediaNotFoundError(FileNotFoundError):
    pass


class TempMediaExpiredError(RuntimeError):
    pass


def publish_temp_media(
    file_bytes: bytes,
    filename: str,
    public_base_url: str,
    expires_in_seconds: int = 3 * 60 * 60,
) -> dict:
    safe_filename = Path(filename or "audio.wav").name or "audio.wav"
    token = uuid.uuid4().hex
    created_at = int(time.time())
    expires_at = created_at + expires_in_seconds
    media_dir = TEMP_MEDIA_ROOT / token
    media_dir.mkdir(parents=True, exist_ok=True)

    file_path = media_dir / safe_filename
    file_path.write_bytes(file_bytes)

    metadata = {
        "token": token,
        "filename": safe_filename,
        "path": str(file_path),
        "created_at": created_at,
        "expires_at": expires_at,
        "content_type": mimetypes.guess_type(safe_filename)[0] or "application/octet-stream",
    }
    _metadata_path(token).write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")

    base = public_base_url.rstrip("/")
    metadata["url"] = f"{base}/api/internal/temp-media/{token}/{quote(safe_filename)}"
    return metadata


def resolve_temp_media(token: str) -> dict:
    metadata = _load_metadata(token)
    if metadata["expires_at"] < int(time.time()):
        raise TempMediaExpiredError(token)
    return metadata


def delete_temp_media(token: str) -> None:
    media_dir = TEMP_MEDIA_ROOT / token
    if media_dir.exists():
        shutil.rmtree(media_dir, ignore_errors=True)


def cleanup_expired_temp_media(now: int | None = None) -> int:
    current = now if now is not None else int(time.time())
    removed = 0
    if not TEMP_MEDIA_ROOT.exists():
        return removed

    for metadata_path in TEMP_MEDIA_ROOT.glob("*/metadata.json"):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if int(metadata.get("expires_at", 0)) <= current:
            token = str(metadata.get("token", "")).strip()
            if token:
                delete_temp_media(token)
                removed += 1
    return removed


def _metadata_path(token: str) -> Path:
    return TEMP_MEDIA_ROOT / token / "metadata.json"


def _load_metadata(token: str) -> dict:
    metadata_path = _metadata_path(token)
    if not metadata_path.exists():
        raise TempMediaNotFoundError(token)
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TempMediaNotFoundError(token) from exc

    file_path = Path(metadata.get("path", ""))
    if not file_path.exists():
        raise TempMediaNotFoundError(token)
    return metadata
