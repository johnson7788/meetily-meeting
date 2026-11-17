import aiosqlite

from ._common import connect_db, now, row_to_action_item, row_to_chapter


async def create_meeting(meeting_id: str, title: str, owner_user_id: str, owner_username: str, project_name=None) -> dict:
    current = now()
    normalized_project_name = (project_name or "").strip() or None
    async with connect_db() as db:
        await db.execute(
            """
            INSERT INTO meetings (id, title, project_name, owner_user_id, owner_username, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?)
            """,
            (meeting_id, title, normalized_project_name, owner_user_id, owner_username, current, current),
        )
        await db.commit()
    return {
        "id": meeting_id,
        "title": title,
        "project_name": normalized_project_name,
        "owner_user_id": owner_user_id,
        "owner_username": owner_username,
        "created_at": current,
        "updated_at": current,
    }


async def get_all_meetings(owner_user_id=None) -> list:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        if owner_user_id is None:
            cursor = await db.execute(
                """
                SELECT id, title, project_name, owner_user_id, owner_username, created_at, updated_at
                FROM meetings
                ORDER BY created_at DESC
                """
            )
        else:
            cursor = await db.execute(
                """
                SELECT id, title, project_name, owner_user_id, owner_username, created_at, updated_at
                FROM meetings
                WHERE owner_user_id=?
                ORDER BY created_at DESC
                """,
                (owner_user_id,),
            )
        return [dict(r) for r in await cursor.fetchall()]


async def get_meeting(meeting_id: str, owner_user_id=None):
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        if owner_user_id is None:
            cursor = await db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,))
        else:
            cursor = await db.execute(
                "SELECT * FROM meetings WHERE id=? AND owner_user_id=?",
                (meeting_id, owner_user_id),
            )
        row = await cursor.fetchone()
        if not row:
            return None
        meeting = dict(row)
        cursor2 = await db.execute("SELECT * FROM transcripts WHERE meeting_id=? ORDER BY sequence_id", (meeting_id,))
        meeting["transcripts"] = [dict(r) for r in await cursor2.fetchall()]
        cursor3 = await db.execute("SELECT status, content, error FROM summaries WHERE meeting_id=?", (meeting_id,))
        summary_row = await cursor3.fetchone()
        meeting["summary"] = dict(summary_row) if summary_row else None
        cursor_labels = await db.execute(
            """
            SELECT source, label, created_at, updated_at
            FROM speaker_labels
            WHERE meeting_id=?
            ORDER BY created_at, source
            """,
            (meeting_id,),
        )
        meeting["speaker_labels"] = [dict(r) for r in await cursor_labels.fetchall()]
        cursor4 = await db.execute(
            """
            SELECT id, task, owner, due, done, position, created_at, updated_at
            FROM action_items
            WHERE meeting_id=?
            ORDER BY position, created_at
            """,
            (meeting_id,),
        )
        meeting["action_items"] = [row_to_action_item(r) for r in await cursor4.fetchall()]
        cursor5 = await db.execute(
            "SELECT id, title, summary, start_sequence_id, start_segment_id, start_timestamp FROM chapters WHERE meeting_id=? ORDER BY position",
            (meeting_id,),
        )
        meeting["chapters"] = [row_to_chapter(r) for r in await cursor5.fetchall()]
        cursor6 = await db.execute(
            "SELECT id, content, created_at as timestamp FROM notes WHERE meeting_id=? ORDER BY created_at",
            (meeting_id,),
        )
        meeting["notes"] = [dict(r) for r in await cursor6.fetchall()]
        return meeting


async def update_meeting_title(meeting_id: str, title: str):
    async with connect_db() as db:
        await db.execute("UPDATE meetings SET title=?, updated_at=? WHERE id=?", (title, now(), meeting_id))
        await db.commit()


async def delete_meeting(meeting_id: str):
    async with connect_db() as db:
        await db.execute("DELETE FROM meetings WHERE id=?", (meeting_id,))
        await db.commit()


async def save_transcripts(meeting_id: str, segments: list):
    async with connect_db() as db:
        for seg in segments:
            await db.execute(
                """
                INSERT OR REPLACE INTO transcripts
                (id, meeting_id, text, postprocessed_text, translated_text, timestamp, source, is_partial, sequence_id,
                 confidence, audio_start_time, audio_end_time, duration)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    seg.get("id"),
                    meeting_id,
                    seg.get("text", ""),
                    seg.get("postprocessed_text"),
                    seg.get("translated_text"),
                    seg.get("timestamp", now()),
                    seg.get("source"),
                    0,
                    seg.get("sequence_id"),
                    seg.get("confidence"),
                    seg.get("audio_start_time"),
                    seg.get("audio_end_time"),
                    seg.get("duration"),
                ),
            )
        await db.commit()


async def create_summary_pending(meeting_id: str):
    current = now()
    async with connect_db() as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO summaries (meeting_id, status, created_at, updated_at)
            VALUES (?,?,?,?)
            """,
            (meeting_id, "pending", current, current),
        )
        await db.commit()


async def update_summary(meeting_id: str, status: str, content=None, error=None):
    async with connect_db() as db:
        await db.execute(
            """
            UPDATE summaries SET status=?, content=?, error=?, updated_at=? WHERE meeting_id=?
            """,
            (status, content, error, now(), meeting_id),
        )
        await db.commit()


async def get_chapters(meeting_id: str) -> list[dict]:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, title, summary, start_sequence_id, start_segment_id, start_timestamp FROM chapters WHERE meeting_id=? ORDER BY position",
            (meeting_id,),
        )
        return [row_to_chapter(r) for r in await cursor.fetchall()]


async def save_chapters(meeting_id: str, chapters: list[dict]) -> list[dict]:
    current = now()
    async with connect_db() as db:
        await db.execute("DELETE FROM chapters WHERE meeting_id=?", (meeting_id,))
        for i, ch in enumerate(chapters):
            await db.execute(
                """
                INSERT INTO chapters (id, meeting_id, title, summary, start_sequence_id, start_segment_id, start_timestamp, position, created_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (ch["id"], meeting_id, ch["title"], ch.get("summary", ""), ch["start_sequence_id"], ch["start_segment_id"], ch.get("start_timestamp", ""), i, current),
            )
        await db.commit()
    return chapters

