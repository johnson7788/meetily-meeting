import aiosqlite

from ._common import connect_db, default_speaker_label, now


async def get_speaker_labels(meeting_id: str) -> list:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT meeting_id, source, label, created_at, updated_at
            FROM speaker_labels
            WHERE meeting_id=?
            ORDER BY created_at, source
            """,
            (meeting_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def replace_speaker_labels(meeting_id: str, labels: list[dict]) -> list:
    current = now()
    saved = []
    async with connect_db() as db:
        await db.execute("DELETE FROM speaker_labels WHERE meeting_id=?", (meeting_id,))
        for item in labels:
            source = (item.get("source") or "").strip()
            label = (item.get("label") or "").strip()
            if not source or not label:
                continue
            await db.execute(
                """
                INSERT INTO speaker_labels (meeting_id, source, label, created_at, updated_at)
                VALUES (?,?,?,?,?)
                """,
                (meeting_id, source, label, current, current),
            )
            saved.append(
                {
                    "meeting_id": meeting_id,
                    "source": source,
                    "label": label,
                    "created_at": current,
                    "updated_at": current,
                }
            )
        await db.commit()
    return saved


async def upsert_default_speaker_labels(meeting_id: str, segments: list[dict]) -> list:
    ordered_sources: list[str] = []
    seen: set[str] = set()
    for seg in segments:
        source = (seg.get("source") or "").strip()
        if not source or source == "upload" or source in seen:
            continue
        seen.add(source)
        ordered_sources.append(source)
    labels = [
        {"source": source, "label": default_speaker_label(index)}
        for index, source in enumerate(ordered_sources)
    ]
    if not labels:
        return []
    return await replace_speaker_labels(meeting_id, labels)

