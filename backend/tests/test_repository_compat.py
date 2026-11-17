import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db
from app.repositories import action_items, meetings, speaker_labels, templates


def test_db_compat_layer_reexports_repository_functions():
    assert db.init_db is not None
    assert db.create_meeting is meetings.create_meeting
    assert db.get_all_meetings is meetings.get_all_meetings
    assert db.get_meeting is meetings.get_meeting
    assert db.update_meeting_title is meetings.update_meeting_title
    assert db.delete_meeting is meetings.delete_meeting
    assert db.save_transcripts is meetings.save_transcripts
    assert db.create_summary_pending is meetings.create_summary_pending
    assert db.update_summary is meetings.update_summary
    assert db.get_action_items is action_items.get_action_items
    assert db.replace_action_items is action_items.replace_action_items
    assert db.get_all_templates is templates.get_all_templates
    assert db.create_template is templates.create_template
    assert db.update_template is templates.update_template
    assert db.delete_template is templates.delete_template
    assert db.get_template is templates.get_template
    assert db.get_speaker_labels is speaker_labels.get_speaker_labels
    assert db.replace_speaker_labels is speaker_labels.replace_speaker_labels
    assert db.upsert_default_speaker_labels is speaker_labels.upsert_default_speaker_labels


def test_repository_functions_respect_patched_db_path(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "meetily.db")

    async def run_flow() -> dict:
        await db.init_db()
        await meetings.create_meeting("meeting-1", "周会", "user-1", "测试用户", "Alpha")
        return await meetings.get_meeting("meeting-1")

    meeting = asyncio.run(run_flow())
    assert meeting is not None
    assert meeting["id"] == "meeting-1"
    assert meeting["project_name"] == "Alpha"
