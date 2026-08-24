"""Pydantic models that MIRROR frontend/src/types.ts EXACTLY.

Field names are camelCase on purpose so the emitted JSON matches the frozen TS
contract without any client-side remapping (runId, ragEvidence, runRate,
sourceRef, stateSummary, failedWorkstream, finalReadout). Do not rename fields
without changing the frontend contract in lockstep.

Numeric convention: capacity, used, demand, remaining, and gap are whole hours
(int); runRate is a utilization fraction (used / capacity), rounded to 2 dp for
display. See SAD section 7.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel

# Literal unions mirror the TS string-literal types in types.ts.
TaskStatus = Literal["Complete", "In Progress", "Not Started", "At Risk"]
Rag = Literal["Red", "Amber", "Green"]
RiskSeverity = Literal["High", "Medium", "Low"]
DraftStatus = Literal["DRAFT", "APPROVED", "REJECTED"]
# The ONLY server-side run statuses (SAD section 8 status mapping).
RunStatus = Literal["AWAITING_APPROVAL", "APPROVED", "REJECTED", "HALTED"]


class Task(BaseModel):
    name: str
    owner: str
    status: TaskStatus
    due: str
    sourceRef: str


class Priority(BaseModel):
    name: str
    tasks: List[Task]
    rag: Rag
    ragEvidence: List[str]


class Workstream(BaseModel):
    name: str
    capacity: int
    used: int
    remaining: int
    demand: int
    runRate: float
    gap: int
    fit: bool
    sourceRef: str


class Risk(BaseModel):
    desc: str
    severity: RiskSeverity
    owner: str
    evidence: List[str]
    rank: int
    gap: int


class StateSummary(BaseModel):
    priorities: List[Priority]
    workstreams: List[Workstream]
    risks: List[Risk]


class Draft(BaseModel):
    markdown: str
    summary: str
    bullets: List[str]
    status: DraftStatus = "DRAFT"


class Diagnostic(BaseModel):
    failedWorkstream: str
    reason: str


class RunResponse(BaseModel):
    runId: str
    status: RunStatus
    draft: Optional[Draft] = None
    stateSummary: Optional[StateSummary] = None
    diagnostic: Optional[Diagnostic] = None


class DecisionRequest(BaseModel):
    action: Literal["approve", "edit", "reject"]
    edits: Optional[str] = None
    reason: Optional[str] = None


class FinalReadout(BaseModel):
    markdown: str


class DecisionResponse(BaseModel):
    runId: str
    status: Literal["APPROVED", "REJECTED"]
    finalReadout: Optional[FinalReadout] = None


# --- Non-contract helper models (backend-internal request/error shapes) ---


class RunStartRequest(BaseModel):
    """Optional POST /api/runs body. focus and top_n are accepted but the MVP
    records-and-ignores them. forceError is a client-only dev switch and is
    explicitly rejected here (extra keys forbidden)."""

    model_config = {"extra": "forbid"}

    focus: Optional[str] = None
    top_n: Optional[int] = None


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorEnvelope(BaseModel):
    error: ErrorBody
