import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import summary_service


def test_generate_summary_rewrites_sparse_output(monkeypatch):
    async def fake_summarize(text: str, model: str, api_key: str, template=None) -> str:
        return """## 会议概要
未提及

## 主要讨论点
未提及

## 关键决策
未提及

## 行动项
未提及

## 待跟进问题
未提及"""

    monkeypatch.setattr(summary_service, "summarize_with_qwen", fake_summarize)

    result = asyncio.run(
        summary_service.generate_summary(
            '今天重点讨论了上线节奏、测试安排和负责人分工。',
            'qwen',
            'qwen-plus',
            'test-key',
        )
    )

    assert '今天重点讨论了上线节奏、测试安排和负责人分工。' in result
    assert result.count('未提及') < 2
    assert '## 会议概要' in result


def test_summary_fallback_ignores_greetings_and_keeps_later_points():
    transcript = "\n".join(
        [
            "[1][00:03][speaker_1] 大家下午好，今天召集大家开会，主要复盘近期的工作进度，同步一下下阶段的安排，各自先简单汇总一下。",
            "[2][00:19][speaker_1] 大家好，我是员工A目前手头的本职工作是计划，我们已按计划完成。",
            "[3][00:26][speaker_1] 然后现阶段的话主要是对接部分的一个流程的卡顿，以及影响推进的效率，需要跨部门的一个协同。",
            "[4][00:43][speaker_1] 大家好，我是员工B我这边的话。",
            "[5][00:46][speaker_1] 项目整体进度正常，关键环节已落地，但需要细节的部分还需要优化，预计本周完成整改。",
        ]
    )

    result = summary_service.build_summary_fallback(transcript)

    overview = result.split("## 主要讨论点", 1)[0]
    assert "下午好" not in overview
    assert "项目进度复盘" in overview
    assert "项目整体进度正常" in result
    assert "预计本周完成整改" in result


def test_summary_fallback_hides_internal_metadata_for_low_information_text():
    transcript = "\n".join(
        [
            "[1][00:01][speaker_1] 你好。",
            "[2][00:02][speaker_2] 我爱。",
            "[3][00:04][speaker_1] 吃饭。",
        ]
    )

    result = summary_service.build_summary_fallback(transcript)

    assert "[speaker_" not in result
    assert "[00:" not in result
    assert "会议主要围绕" not in result
    assert "原始转写内容较少" in result
