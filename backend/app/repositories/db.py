import aiosqlite

from ._common import connect_db


async def _ensure_meeting_columns(db: aiosqlite.Connection) -> None:
    cursor = await db.execute("PRAGMA table_info(meetings)")
    columns = {row[1] for row in await cursor.fetchall()}
    if "project_name" not in columns:
        await db.execute("ALTER TABLE meetings ADD COLUMN project_name TEXT")
    if "owner_user_id" not in columns:
        await db.execute("ALTER TABLE meetings ADD COLUMN owner_user_id TEXT")
    if "owner_username" not in columns:
        await db.execute("ALTER TABLE meetings ADD COLUMN owner_username TEXT")


async def _ensure_transcript_columns(db: aiosqlite.Connection) -> None:
    cursor = await db.execute("PRAGMA table_info(transcripts)")
    columns = {row[1] for row in await cursor.fetchall()}
    if "postprocessed_text" not in columns:
        await db.execute("ALTER TABLE transcripts ADD COLUMN postprocessed_text TEXT")
    if "translated_text" not in columns:
        await db.execute("ALTER TABLE transcripts ADD COLUMN translated_text TEXT")


async def init_db():
    async with connect_db() as db:
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                project_name TEXT,
                owner_user_id TEXT,
                owner_username TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                text TEXT NOT NULL,
                postprocessed_text TEXT,
                translated_text TEXT,
                timestamp TEXT NOT NULL,
                source TEXT,
                is_partial INTEGER DEFAULT 0,
                sequence_id INTEGER,
                confidence REAL,
                audio_start_time REAL,
                audio_end_time REAL,
                duration REAL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS speaker_labels (
                meeting_id TEXT NOT NULL,
                source TEXT NOT NULL,
                label TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (meeting_id, source),
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS summaries (
                meeting_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'pending',
                content TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS action_items (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                task TEXT NOT NULL,
                owner TEXT,
                due TEXT,
                done INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS chapters (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                start_sequence_id INTEGER NOT NULL,
                start_segment_id TEXT NOT NULL,
                start_timestamp TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        """
        )
        await _ensure_meeting_columns(db)
        await _ensure_transcript_columns(db)
        await db.commit()

