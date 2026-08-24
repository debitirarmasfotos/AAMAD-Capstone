"""Draft grounding guardrail (SAD section 7/9, Sprint-3 review hardening #4).

After the Narrative crew writes a Draft, this checks that the domain figures and
RAG labels it used actually appear in the computed StateSummary. If the model
invented a number or a RAG value that is not backed by the deterministic state,
the draft is rejected so the orchestrator's retry-then-halt policy applies. This
enforces "no invented figures" beyond the prompt instruction alone.

The check is deliberately conservative to avoid false rejections of valid drafts:
- Only "domain figures" are checked (integers >= 50). Small integers (ranks,
  counts, "3 of 4") and year-like values (1900-2100, dates) are ignored.
- runRate fractions are allowed in their whole-percent form (0.65 -> 65).
- A RAG word is flagged only if it does not appear as any priority's rag.
"""

from __future__ import annotations

import re
from typing import Set

from .models import Draft, StateSummary

_RAG_WORDS = ("Red", "Amber", "Green")
_DOMAIN_FIGURE_MIN = 50  # below this: ranks/counts/small numbers, not checked


class DraftGroundingError(ValueError):
    """Raised when a Draft contains figures or RAG labels not in the state."""


def _draft_text(draft: Draft) -> str:
    parts = [draft.markdown or "", draft.summary or ""]
    parts.extend(draft.bullets or [])
    return "\n".join(parts)


def _allowed_numbers(state: StateSummary) -> Set[int]:
    """Every integer the draft is allowed to cite, drawn from the computed state."""
    allowed: Set[int] = set()
    for w in state.workstreams:
        for value in (w.capacity, w.used, w.remaining, w.demand, w.gap):
            allowed.add(int(round(value)))
        allowed.add(int(round(w.runRate * 100)))  # percent form, e.g. 0.65 -> 65
    for r in state.risks:
        allowed.add(int(r.rank))
        allowed.add(int(round(r.gap)))
    # Counts are legitimately derived (e.g. "3 of 4 workstreams").
    total = len(state.priorities) + len(state.workstreams) + len(state.risks)
    for i in range(0, max(total, 10) + 1):
        allowed.add(i)
    return allowed


def verify_draft_grounding(draft: Draft, state: StateSummary) -> None:
    """Raise DraftGroundingError if the draft cites content not in the state."""
    text = _draft_text(draft)
    allowed = _allowed_numbers(state)

    # Domain figures: standalone integers the model wrote. Ignore small numbers
    # (ranks/counts) and year-like values (dates) to avoid false positives.
    found = {int(m) for m in re.findall(r"\d+", text)}
    ungrounded_numbers = sorted(
        n for n in found
        if n >= _DOMAIN_FIGURE_MIN and not (1900 <= n <= 2100) and n not in allowed
    )

    # RAG labels the draft used must exist among the priorities' rag values.
    state_rags = {p.rag for p in state.priorities}
    used_rags = {w for w in _RAG_WORDS if re.search(rf"\b{w}\b", text)}
    ungrounded_rags = sorted(used_rags - state_rags)

    problems = []
    if ungrounded_numbers:
        problems.append(
            "figures not present in stateSummary: "
            + ", ".join(str(n) for n in ungrounded_numbers)
        )
    if ungrounded_rags:
        problems.append(
            "RAG labels not present in stateSummary: " + ", ".join(ungrounded_rags)
        )

    if problems:
        raise DraftGroundingError(
            "Narrative draft is not grounded in the computed state ("
            + "; ".join(problems)
            + ")."
        )
