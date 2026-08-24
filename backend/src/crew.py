"""Narrative crew (CrewAI, YAML-first) - the ONLY LLM step (SAD section 3/4).

A single-agent, sequential crew that writes the DRAFT readout from the already
computed StateSummary. It does NOT recompute or alter RAG / gap / evidence; the
arithmetic is done deterministically in compute.py. Temperature is pinned to 0
for reproducibility (SAD section 9). The crew is only exercised when a real
OPENAI_API_KEY is present; importing this module makes no network calls.
"""

from __future__ import annotations

import os

from crewai import LLM, Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from .models import Draft


@CrewBase
class NarrativeCrew:
    """Single-agent Narrative crew for the MVP."""

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    def _llm(self) -> LLM:
        # Low/zero temperature for a stable DRAFT (SAD section 9).
        return LLM(model=os.getenv("OPENAI_MODEL", "gpt-4o"), temperature=0)

    @agent
    def narrative_writer(self) -> Agent:
        return Agent(
            config=self.agents_config["narrative_writer"],
            llm=self._llm(),
            allow_delegation=False,
            verbose=True,
        )

    @task
    def narrative_task(self) -> Task:
        # output_pydantic binds the LLM output to the frozen Draft shape.
        return Task(
            config=self.tasks_config["narrative_task"],
            output_pydantic=Draft,
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
