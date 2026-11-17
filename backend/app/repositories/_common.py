import aiosqlite
from datetime import datetime, timezone


def get_db_path():
    from .. import db as app_db

    return app_db.DB_PATH


def connect_db():
    return aiosqlite.connect(get_db_path())


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_action_item(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "task": row["task"],
        "owner": row["owner"],
        "due": row["due"],
        "done": bool(row["done"]),
        "position": row["position"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_chapter(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "summary": row["summary"],
        "start_sequence_id": row["start_sequence_id"],
        "start_segment_id": row["start_segment_id"],
        "start_timestamp": row["start_timestamp"],
    }


def default_speaker_label(index: int) -> str:
    return f"说话人{index + 1}"

