"""Deterministic program-state computation (SAD section 7).

This is CODE, not an LLM (Carmelo review #1 / Reproducibility NFR). Given the
same normalized source it always yields the same StateSummary: identical RAG
rollup, capacity fit signals, and risk ranking. The Narrative LLM only phrases
these facts later; it never recomputes them.

Rules (SAD section 7):
  * RAG rollup: any child At Risk -> Red; else any In Progress / Not Started ->
    Amber; all Complete -> Green. ragEvidence cites the child rows that drove it.
  * Capacity: remaining = capacity - used; fit = remaining >= demand;
    gap = max(0, demand - remaining); runRate = used / capacity.
  * Risks: built from At Risk tasks and capacity breaches. Total-order ranking:
    severity descending, then gap descending, then a stable sourceRef key.
"""

from __future__ import annotations

from typing import Any, Dict, List

from .models import Priority, Risk, StateSummary, Task, Workstream

_SEVERITY_ORDER = {"High": 3, "Medium": 2, "Low": 1}


def _rollup_rag(tasks: List[Task]) -> tuple[str, List[str]]:
    """Derive a priority's RAG from its child tasks and cite the driving rows."""
    at_risk = [t.sourceRef for t in tasks if t.status == "At Risk"]
    if at_risk:
        return "Red", at_risk

    open_rows = [t.sourceRef for t in tasks if t.status in ("In Progress", "Not Started")]
    if open_rows:
        return "Amber", open_rows

    # All Complete (or empty): Green, citing the complete rows.
    return "Green", [t.sourceRef for t in tasks]


def _capacity_signal(ws: Dict[str, Any]) -> Workstream:
    capacity = int(ws["capacity"])
    used = int(ws["used"])
    demand = int(ws["demand"])
    remaining = capacity - used
    fit = remaining >= demand
    gap = max(0, demand - remaining)
    run_rate = round(used / capacity, 2) if capacity else 0.0
    return Workstream(
        name=ws["name"],
        capacity=capacity,
        used=used,
        remaining=remaining,
        demand=demand,
        runRate=run_rate,
        gap=gap,
        fit=fit,
        sourceRef=ws["sourceRef"],
    )


def _capacity_severity(gap: int, demand: int) -> str:
    """Grade a capacity-breach severity by how much of demand is uncovered.

    >= 50% uncovered -> High, >= 25% -> Medium, else Low. Deterministic and
    figure-traceable; the numeric gap still drives ordering within a severity.
    """
    if demand <= 0:
        return "Low"
    fraction = gap / demand
    if fraction >= 0.5:
        return "High"
    if fraction >= 0.25:
        return "Medium"
    return "Low"


def compute_program_state(source: Dict[str, Any]) -> StateSummary:
    # --- priorities + RAG rollup ---
    priorities: List[Priority] = []
    for p in source["priorities"]:
        tasks = [Task(**t) for t in p["tasks"]]
        rag, evidence = _rollup_rag(tasks)
        priorities.append(
            Priority(name=p["name"], tasks=tasks, rag=rag, ragEvidence=evidence)
        )

    # --- workstream capacity signals ---
    workstreams: List[Workstream] = [_capacity_signal(ws) for ws in source["workstreams"]]

    # --- risks (build, then total-order rank) ---
    raw_risks: List[Dict[str, Any]] = []

    # Risks from At Risk tasks (delivery risk on an explicitly at-risk item).
    for p in priorities:
        for t in p.tasks:
            if t.status == "At Risk":
                raw_risks.append(
                    {
                        "desc": (
                            f"{p.name} task '{t.name}' is At Risk "
                            f"(owner {t.owner}, due {t.due})."
                        ),
                        "severity": "High",
                        "owner": t.owner,
                        "evidence": [t.sourceRef],
                        "gap": 0,
                        "key": t.sourceRef,
                    }
                )

    # Risks from capacity breaches (no-fit workstreams carry their gap).
    for w in workstreams:
        if not w.fit:
            severity = _capacity_severity(w.gap, w.demand)
            raw_risks.append(
                {
                    "desc": (
                        f"{w.name} capacity breach: remaining {w.remaining}h "
                        f"below {w.demand}h demand (gap {w.gap}h)."
                    ),
                    "severity": severity,
                    "owner": w.name,
                    "evidence": [w.sourceRef],
                    "gap": w.gap,
                    "key": w.sourceRef,
                }
            )

    # Total order: severity desc, then gap desc, then stable sourceRef key.
    raw_risks.sort(
        key=lambda r: (-_SEVERITY_ORDER[r["severity"]], -r["gap"], r["key"])
    )

    risks: List[Risk] = [
        Risk(
            desc=r["desc"],
            severity=r["severity"],
            owner=r["owner"],
            evidence=r["evidence"],
            rank=i + 1,
            gap=r["gap"],
        )
        for i, r in enumerate(raw_risks)
    ]

    return StateSummary(priorities=priorities, workstreams=workstreams, risks=risks)
