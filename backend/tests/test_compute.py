"""Deterministic compute test - the key offline test (no LLM).

Parses the REAL synthetic CSVs and asserts the RAG rollup, capacity fit/gap/
runRate, and risk ranking exactly per SAD section 7.
"""

from src.compute import compute_program_state
from src.source import ProgramSource


def _state():
    return compute_program_state(ProgramSource().fetch())


def test_clean_fixture_has_no_ingestion_diagnostics():
    source = ProgramSource().fetch()
    assert source["diagnostics"] == []
    assert len(source["priorities"]) == 4
    assert len(source["workstreams"]) == 4


def test_rag_rollup():
    state = _state()
    rag = {p.name: p.rag for p in state.priorities}
    assert rag == {
        "Customer Data Platform": "Amber",
        "Campaign Engine": "Red",
        "Analytics & Reporting": "Amber",
        "Governance & Compliance": "Red",
    }

    by_name = {p.name: p for p in state.priorities}
    # Amber cites the In Progress / Not Started rows.
    assert by_name["Customer Data Platform"].ragEvidence == ["sheet:row5", "sheet:row6"]
    # Red cites the At Risk rows.
    assert by_name["Campaign Engine"].ragEvidence == ["sheet:row10"]
    assert by_name["Governance & Compliance"].ragEvidence == ["sheet:row18"]


def test_capacity_signals():
    state = _state()
    ws = {w.name: w for w in state.workstreams}

    cdp = ws["Customer Data Platform"]
    assert (cdp.remaining, cdp.fit, cdp.gap, cdp.runRate) == (1400, False, 200, 0.65)

    campaign = ws["Campaign Engine"]
    assert (campaign.remaining, campaign.fit, campaign.gap, campaign.runRate) == (900, False, 400, 0.7)

    analytics = ws["Analytics & Reporting"]
    assert (analytics.remaining, analytics.fit, analytics.gap, analytics.runRate) == (1300, True, 0, 0.41)

    gov = ws["Governance & Compliance"]
    assert (gov.remaining, gov.fit, gov.gap, gov.runRate) == (300, False, 600, 0.83)


def test_risk_ranking_total_order():
    state = _state()
    risks = state.risks

    # ranks are contiguous 1..n
    assert [r.rank for r in risks] == list(range(1, len(risks) + 1))

    # Governance capacity breach is the top risk (High severity, largest gap 600).
    top = risks[0]
    assert top.rank == 1
    assert top.severity == "High"
    assert top.gap == 600
    assert "burn:row5" in top.evidence
    assert top.owner == "Governance & Compliance"

    # Non-increasing severity, then non-increasing gap within a severity.
    order = {"High": 3, "Medium": 2, "Low": 1}
    keys = [(order[r.severity], r.gap) for r in risks]
    assert keys == sorted(keys, reverse=True)

    # Expected full ranking of the seeded fixture:
    # 1 Governance breach (High, 600)
    # 2 Campaign At Risk task Suppression rules (High, 0, sheet:row10)
    # 3 Governance At Risk task Consent management (High, 0, sheet:row18)
    # 4 Campaign breach (Medium, 400)
    # 5 CDP breach (Low, 200)
    assert len(risks) == 5
    assert risks[1].severity == "High" and risks[1].gap == 0 and risks[1].evidence == ["sheet:row10"]
    assert risks[2].severity == "High" and risks[2].gap == 0 and risks[2].evidence == ["sheet:row18"]
    assert risks[3].severity == "Medium" and risks[3].gap == 400
    assert risks[4].severity == "Low" and risks[4].gap == 200


def test_every_figure_traces_to_a_source_row():
    state = _state()
    for p in state.priorities:
        assert p.ragEvidence, f"{p.name} RAG has no evidence"
        for t in p.tasks:
            assert t.sourceRef.startswith("sheet:row")
    for w in state.workstreams:
        assert w.sourceRef.startswith("burn:row")
    for r in state.risks:
        assert r.evidence and all(e.startswith(("sheet:row", "burn:row")) for e in r.evidence)
