"""
AI agent orchestration skeleton.

The control flow is intentionally narrow:
1. Receive natural language and frontend context.
2. Use tool calling to convert time phrases into exact query ranges.
3. Fetch only the minimum Firestore data needed for the response.
4. Generate the final report from the compact result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


SYSTEM_PROMPT = """
You are ProJED's AI project assistant.
You have access to currentSystemTime from the frontend.
When the user asks for a time window such as "last week", "past month", or "this month",
you must compute exact startDate and endDate using currentSystemTime as the reference.
Then call get_workspace_tasks with the computed ISO timestamps and the relevant status filters.
Only query the minimum required Firestore data and keep the response concise.
""".strip()


@dataclass
class QueryConstraints:
    date_range: Optional[dict[str, str]] = None
    statuses: list[str] = field(default_factory=list)
    workspace_id: Optional[str] = None
    board_id: Optional[str] = None
    keyword: Optional[str] = None


@dataclass
class AgentPlan:
    original_prompt: str
    current_system_time: str
    constraints: QueryConstraints
    retrieved_summary: dict[str, Any] = field(default_factory=dict)


def get_workspace_tasks(
    workspaceId: str,
    status_filter: list[str],
    startDate: str,
    endDate: str,
) -> dict[str, Any]:
    """
    Tool callable by the agent.

    Args:
        workspaceId: Workspace scope supplied by the frontend.
        status_filter: Task status array, for example ['todo', 'delayed'].
        startDate: ISO 8601 start bound.
        endDate: ISO 8601 end bound.

    Returns:
        A compact task payload, not raw Firestore documents.
    """
    raise NotImplementedError("Tool use scaffold only; Firestore query implementation comes later.")


def build_query_constraints(natural_language: str, current_system_time: str) -> QueryConstraints:
    """
    Convert natural language plus currentSystemTime into structured query constraints.

    The real implementation should be driven by tool use / function calling so the
    model emits a schema-compatible object instead of free text.
    """
    raise NotImplementedError("Function Calling / Tool Use parser is not implemented yet.")


def fetch_compact_project_data(constraints: QueryConstraints) -> dict[str, Any]:
    """
    Read only the minimum Firestore data needed for the query.

    This function should call firebase_admin helpers and return reduced payloads.
    """
    raise NotImplementedError("Firestore retrieval skeleton only; implementation comes later.")


def generate_final_report(plan: AgentPlan) -> str:
    """Produce a concise natural-language response from the structured plan."""
    raise NotImplementedError("Final report generation skeleton only; implementation comes later.")


def run_agent(natural_language: str, current_system_time: str) -> AgentPlan:
    """
    End-to-end orchestration placeholder.

    Intended control flow:
    parse -> retrieve -> summarize -> return report
    """
    constraints = build_query_constraints(natural_language, current_system_time)
    summary = fetch_compact_project_data(constraints)
    return AgentPlan(
        original_prompt=natural_language,
        current_system_time=current_system_time,
        constraints=constraints,
        retrieved_summary=summary,
    )
