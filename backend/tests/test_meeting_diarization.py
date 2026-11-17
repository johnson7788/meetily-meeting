import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.diarization import normalize_diarized_sentences


def test_normalize_diarized_sentences_uses_generic_speaker_labels():
    segments = normalize_diarized_sentences(
        [
            {"text": "先说一下当前进展。", "begin_time": 0, "end_time": 1200, "speaker_id": 4},
            {"text": "我这边补充两点。", "begin_time": 1500, "end_time": 3200, "speaker_id": 9},
            {"text": "好的，继续。", "begin_time": 3300, "end_time": 4100, "speaker_id": 4},
        ]
    )

    assert [segment["source"] for segment in segments] == ["speaker_1", "speaker_2", "speaker_1"]
    assert [segment["sequence_id"] for segment in segments] == [0, 1, 2]
    assert segments[0]["timestamp"] == "00:00"
    assert segments[1]["audio_start_time"] == 1.5
    assert segments[1]["duration"] == 1.7


def test_normalize_diarized_sentences_merges_short_single_turn_speaker_fragments():
    segments = normalize_diarized_sentences(
        [
            {"text": "今天先看整体进度。", "begin_time": 0, "end_time": 8000, "speaker_id": 10},
            {"text": "我补充一个背景。", "begin_time": 8200, "end_time": 10800, "speaker_id": 99},
            {"text": "后面按这个节奏推进。", "begin_time": 11000, "end_time": 17000, "speaker_id": 10},
            {"text": "接口这块已经完成。", "begin_time": 18000, "end_time": 26000, "speaker_id": 20},
            {"text": "这里有个小问题。", "begin_time": 26200, "end_time": 29200, "speaker_id": 77},
            {"text": "剩下的是联调。", "begin_time": 30000, "end_time": 38000, "speaker_id": 20},
        ]
    )

    assert [segment["source"] for segment in segments] == [
        "speaker_1",
        "speaker_1",
        "speaker_1",
        "speaker_2",
        "speaker_2",
        "speaker_2",
    ]
