import uuid

import aiosqlite

from ._common import connect_db, now


async def save_notes(meeting_id: str, notes: list[dict]) -> None:
    if not notes:
        return
    async with connect_db() as db:
        for note in notes:
            await db.execute(
                "INSERT INTO notes (id, meeting_id, content, created_at) VALUES (?,?,?,?)",
                (uuid.uuid4().hex, meeting_id, note.get("content", ""), note.get("timestamp", now())),
            )
        await db.commit()


async def get_notes(meeting_id: str) -> list[dict]:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, content, created_at as timestamp FROM notes WHERE meeting_id=? ORDER BY created_at",
            (meeting_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
