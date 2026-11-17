import uuid

import aiosqlite

from ._common import connect_db, now, row_to_action_item


async def get_action_items(meeting_id: str) -> list:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, task, owner, due, done, position, created_at, updated_at
            FROM action_items
            WHERE meeting_id=?
            ORDER BY position, created_at
            """,
            (meeting_id,),
        )
        return [row_to_action_item(r) for r in await cursor.fetchall()]


async def replace_action_items(meeting_id: str, items: list) -> list:
    current = now()
    saved_items = []
    async with connect_db() as db:
        await db.execute("DELETE FROM action_items WHERE meeting_id=?", (meeting_id,))
        for index, item in enumerate(items):
            task = (item.get("task") or "").strip()
            if not task:
                continue
            item_id = item.get("id") or uuid.uuid4().hex
            owner = item.get("owner")
            due = item.get("due")
            done = 1 if item.get("done") else 0
            position = item.get("position")
            if position is None:
                position = index
            await db.execute(
                """
                INSERT INTO action_items
                (id, meeting_id, task, owner, due, done, position, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (item_id, meeting_id, task, owner, due, done, position, current, current),
            )
            saved_items.append(
                {
                    "id": item_id,
                    "task": task,
                    "owner": owner,
                    "due": due,
                    "done": bool(done),
                    "position": position,
                    "created_at": current,
                    "updated_at": current,
                }
            )
        await db.commit()
    return saved_items

