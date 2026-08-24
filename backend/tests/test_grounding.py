"""Tests for the draft grounding guardrail (offline, no LLM)."""

import pytest

from src.grounding import DraftGroundingError, verify_draft_grounding
from src.models import Draft, Priority, Risk, StateSummary, Workstream


def _state() -> StateSummary:
    return StateSummary(
        priorities=[
            Priority(name="Governance", tasks=[], rag="Red", ragEvidence=["sheet:row18"]),
            Priority(name="Analytics", tasks=[], rag="Amber", ragEvidence=["sheet:row14"]),
        ],
        workstreams=[
            Workstream(
                name="Governance", capacity=900, used=750, remaining=300,
                demand=900, runRate=0.83, gap=600, fit=False, sourceRef="burn:row4",
            ),
        ],
        risks=[
            Risk(desc="Governance capacity breach", severity="High",
                 owner="R. Nunez", evidence=["burn:row4"], rank=1, gap=600),
        ],
    )


def _draft(markdown: str) -> Draft:
    return Draft(markdown=markdown, summary=markdown, bullets=[markdown], status="DRAFT")


def test_grounded_draft_passes():
    # Uses only figures present in the state: gap 600, capacity 900, runRate 83%,
    # RAG values Red/Amber, and small counts.
    draft = _draft(
        "Governance is Red with a capacity gap of 600h against 900h demand "
        "(83% utilization). Analytics is Amber. 1 of 2 workstreams is over capacity."
    )
    # Should not raise.
    verify_draft_grounding(draft, _state())


def test_fabricated_figure_rejected():
    draft = _draft("Governance is Red with a capacity gap of 725h.")  # 725 not in state
    with pytest.raises(DraftGroundingError) as exc:
        verify_draft_grounding(draft, _state())
    assert "725" in str(exc.value)


def test_fabricated_rag_rejected():
    # State has only Red and Amber; the draft invents Green.
    draft = _draft("Governance is Red; the Analytics workstream is Green and healthy.")
    with pytest.raises(DraftGroundingError) as exc:
        verify_draft_grounding(draft, _state())
    assert "Green" in str(exc.value)


def test_year_like_numbers_are_ignored():
    # Dates / years must not be flagged as fabricated figures.
    draft = _draft("Governance is Red; a consent task is due 2026-08-12 with gap 600h.")
    verify_draft_grounding(draft, _state())
