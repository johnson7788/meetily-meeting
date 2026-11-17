import aiosqlite

from ._common import connect_db, now


async def get_all_templates() -> list:
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM templates ORDER BY created_at")
        return [dict(r) for r in await cursor.fetchall()]


async def create_template(template_id: str, name: str, content: str) -> dict:
    current = now()
    async with connect_db() as db:
        await db.execute(
            "INSERT INTO templates (id, name, content, created_at) VALUES (?,?,?,?)",
            (template_id, name, content, current),
        )
        await db.commit()
    return {"id": template_id, "name": name, "content": content, "created_at": current}


async def update_template(template_id: str, name: str, content: str):
    async with connect_db() as db:
        await db.execute(
            "UPDATE templates SET name=?, content=? WHERE id=?",
            (name, content, template_id),
        )
        await db.commit()


async def delete_template(template_id: str):
    async with connect_db() as db:
        await db.execute("DELETE FROM templates WHERE id=?", (template_id,))
        await db.commit()


async def get_template(template_id: str):
    async with connect_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM templates WHERE id=?", (template_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None

