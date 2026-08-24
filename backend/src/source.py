"""Source-agnostic ingestion (SAD section 5).

ProgramSource.fetch() reads the two synthetic CSVs from the repo data/ dir and
returns a normalized dict: { priorities, workstreams, sourceRefs, diagnostics }.
Downstream code never touches a file format directly, so a live connector can
replace the MVP files behind the same contract (PRD AC-1.3).

Validation (PRD AC-1.2): missing or malformed rows are NOT silently dropped.
Each is recorded in `diagnostics` with a row identifier, a reason, and a
sourceRef ("sheet:rowN" / "burn:rowN"). This computes NO analysis; the RAG
rollup, capacity fit, and risk ranking are the deterministic job of compute.py.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List

# Valid task-status values per the frozen contract (types.ts TaskStatus).
VALID_STATUS = {"Complete", "In Progress", "Not Started", "At Risk"}


def _data_dir() -> Path:
    # backend/src/source.py -> parents[2] is the repo root; data/ lives there.
    return Path(__file__).resolve().parents[2] / "data"


class ProgramSource:
    """MVP source that reads the two synthetic fixtures."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or _data_dir()
        self.sheet_path = self.data_dir / "mock_project_sheet.csv"
        self.burn_path = self.data_dir / "mock_burn_capacity.csv"

    def fetch(self) -> Dict[str, Any]:
        diagnostics: List[Dict[str, Any]] = []
        source_refs: List[str] = []

        priorities = self._read_project_sheet(diagnostics, source_refs)
        workstreams = self._read_burn(diagnostics, source_refs)

        return {
            "priorities": priorities,
            "workstreams": workstreams,
            "sourceRefs": source_refs,
            "diagnostics": diagnostics,
        }

    # --- project sheet ---------------------------------------------------

    def _read_project_sheet(
        self, diagnostics: List[Dict[str, Any]], source_refs: List[str]
    ) -> List[Dict[str, Any]]:
        if not self.sheet_path.exists():
            raise FileNotFoundError(f"Project sheet not found: {self.sheet_path}")

        priorities: List[Dict[str, Any]] = []
        by_name: Dict[str, Dict[str, Any]] = {}
        current: Dict[str, Any] | None = None

        with self.sheet_path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.reader(fh))

        # Line 1 is the header. Priority-header rows carry a Priority Name with
        # blank Task/Owner/Status; the rows beneath them are that priority's tasks.
        for idx, raw in enumerate(rows[1:], start=2):
            source_ref = f"sheet:row{idx}"
            cells = [c.strip() for c in raw] + ["", "", "", "", ""]
            priority_name, task_name, owner, status, due = cells[:5]

            if not priority_name:
                diagnostics.append(
                    {"row": idx, "reason": "missing priority name", "sourceRef": source_ref}
                )
                continue

            if not task_name:
                # Priority-header row: register the priority once.
                if priority_name not in by_name:
                    current = {"name": priority_name, "tasks": []}
                    by_name[priority_name] = current
                    priorities.append(current)
                else:
                    current = by_name[priority_name]
                continue

            # Task row.
            target = by_name.get(priority_name) or current
            if target is None:
                diagnostics.append(
                    {
                        "row": idx,
                        "reason": "task row before any priority header",
                        "sourceRef": source_ref,
                    }
                )
                continue

            if status not in VALID_STATUS:
                diagnostics.append(
                    {
                        "row": idx,
                        "reason": f"unrecognized task status '{status}'",
                        "sourceRef": source_ref,
                    }
                )
                continue

            source_refs.append(source_ref)
            target["tasks"].append(
                {
                    "name": task_name,
                    "owner": owner or "Unassigned",
                    "status": status,
                    "due": due,
                    "sourceRef": source_ref,
                }
            )

        return priorities

    # --- burn / capacity -------------------------------------------------

    def _read_burn(
        self, diagnostics: List[Dict[str, Any]], source_refs: List[str]
    ) -> List[Dict[str, Any]]:
        if not self.burn_path.exists():
            raise FileNotFoundError(f"Burn/capacity file not found: {self.burn_path}")

        workstreams: List[Dict[str, Any]] = []

        with self.burn_path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.reader(fh))

        for idx, raw in enumerate(rows[1:], start=2):
            source_ref = f"burn:row{idx}"
            cells = [c.strip() for c in raw] + ["", "", "", ""]
            name, capacity_s, used_s, demand_s = cells[:4]

            if not name:
                diagnostics.append(
                    {"row": idx, "reason": "missing workstream name", "sourceRef": source_ref}
                )
                continue

            try:
                capacity = int(capacity_s)
                used = int(used_s)
                demand = int(demand_s)
            except ValueError:
                diagnostics.append(
                    {
                        "row": idx,
                        "reason": "non-numeric capacity/used/demand",
                        "sourceRef": source_ref,
                    }
                )
                continue

            source_refs.append(source_ref)
            workstreams.append(
                {
                    "name": name,
                    "capacity": capacity,
                    "used": used,
                    "demand": demand,
                    "sourceRef": source_ref,
                }
            )

        return workstreams
