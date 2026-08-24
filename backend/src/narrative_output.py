"""Output model for the Narrative LLM step.

This model is intentionally kept in its own module WITHOUT
`from __future__ import annotations`, and uses only simple types (str, List[str]).

Reason: CrewAI 0.86 introspects `output_pydantic.__annotations__` directly and
calls `.__name__` on each field type (crewai/utilities/converter.py). If the
defining module uses future annotations, every annotation is a string and that
call raises `'str' object has no attribute '__name__'`; a `Literal` field breaks
it the same way. So the Narrative agent writes into this narrow, converter-safe
model, and the orchestrator maps it into the full frozen `Draft` (adding the
DRAFT status, which is a backend invariant, not the model's decision).
"""

from typing import List

from pydantic import BaseModel


class NarrativeDraft(BaseModel):
    """The fields the Narrative agent produces: prose only, no status."""

    markdown: str
    summary: str
    bullets: List[str]
