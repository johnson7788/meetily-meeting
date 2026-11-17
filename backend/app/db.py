import os
from pathlib import Path

DB_PATH = Path(os.getenv("MEETILY_DB_PATH", str(Path(__file__).parent.parent / "meetily.db")))

from .repositories.action_items import get_action_items, replace_action_items
from .repositories.db import init_db
from .repositories.meetings import (
    create_meeting,
    create_summary_pending,
    delete_meeting,
    get_all_meetings,
    get_meeting,
    save_transcripts,
    update_meeting_title,
    update_summary,
)
from .repositories.speaker_labels import get_speaker_labels, replace_speaker_labels, upsert_default_speaker_labels
from .repositories.templates import create_template, delete_template, get_all_templates, get_template, update_template

