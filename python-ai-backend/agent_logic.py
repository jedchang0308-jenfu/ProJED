"""
AI agent orchestration for the ProJED assistant.

The model may reason over the user's natural-language request, but it can only
read project data through the explicit tool in this module. This keeps Firestore
access centralized and caps the amount of data sent back to the LLM.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from openai import OpenAI

from firebase_client import get_firestore_client


DEFAULT_MODEL = "gemini-3.1-flash-lite"
ALLOWED_MODELS = {"gemini-3.1-flash-lite", "gemini-3.1-flash"}
MAX_TASKS_RETURNED = 80

SYSTEM_PROMPT = """
You are ProJED's AI project assistant.

You have access to currentSystemTime from the frontend. When the user asks for
a time window such as "last week", "past month", or "this month", compute exact
startDate and endDate using currentSystemTime as the reference, then call
get_workspace_tasks with those ISO timestamps.

Rules:
- You must use tools for project/task facts. Do not invent project status.
- Query only the active workspace scope supplied by the frontend.
- Prefer narrow status_filter values when the user asks about delayed,
  completed, active, paused, or uncertain tasks.
- Return concise Traditional Chinese.
- When referencing a task, use Markdown links in this format: [task title](task:taskId).
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
    final_report: str = ""
    model: str = DEFAULT_MODEL


def _get_openai_client() -> OpenAI:
    api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing AI_API_KEY or OPENAI_API_KEY")

    base_url = os.getenv("AI_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    if base_url:
        return OpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key)


def _normalize_model(model: str | None) -> str:
    if model in ALLOWED_MODELS:
        return model
    return DEFAULT_MODEL


def _date_part(value: str | None) -> str:
    if not value:
        return ""
    return value[:10]


def _task_overlaps_range(task: dict[str, Any], start_date: str, end_date: str) -> bool:
    task_start = _date_part(task.get("startDate"))
    task_end = _date_part(task.get("endDate"))

    if not task_start and not task_end:
        return False

    effective_start = task_start or task_end
    effective_end = task_end or task_start
    return effective_start <= end_date and effective_end >= start_date


def _compact_task(board_id: str, board_title: str, task: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": task.get("id"),
        "title": task.get("title", ""),
        "status": task.get("status", ""),
        "startDate": task.get("startDate"),
        "endDate": task.get("endDate"),
        "nodeType": task.get("nodeType"),
        "parentId": task.get("parentId"),
        "boardId": board_id,
        "boardTitle": board_title,
    }


def _fetch_workspace_tasks(
    workspace_id: str,
    status_filter: list[str],
    start_date: str,
    end_date: str,
    board_id: str | None = None,
) -> dict[str, Any]:
    db = get_firestore_client()
    status_set = {status for status in status_filter if status}
    workspace_ref = db.collection("workspaces").document(workspace_id)

    if board_id:
        board_refs = [workspace_ref.collection("boards").document(board_id).get()]
    else:
        board_refs = list(workspace_ref.collection("boards").stream())

    tasks: list[dict[str, Any]] = []
    scanned = 0

    for board_doc in board_refs:
        if not board_doc.exists:
            continue

        board_data = board_doc.to_dict() or {}
        board_title = board_data.get("title", "")
        node_docs = board_doc.reference.collection("nodes").stream()

        for node_doc in node_docs:
            scanned += 1
            task = node_doc.to_dict() or {}
            task.setdefault("id", node_doc.id)

            if status_set and task.get("status") not in status_set:
                continue

            if not _task_overlaps_range(task, start_date, end_date):
                continue

            tasks.append(_compact_task(board_doc.id, board_title, task))
            if len(tasks) >= MAX_TASKS_RETURNED:
                break

        if len(tasks) >= MAX_TASKS_RETURNED:
            break

    return {
        "workspaceId": workspace_id,
        "boardId": board_id,
        "status_filter": sorted(status_set),
        "startDate": start_date,
        "endDate": end_date,
        "tasks": tasks,
        "returned": len(tasks),
        "scanned": scanned,
        "truncated": len(tasks) >= MAX_TASKS_RETURNED,
    }


def get_workspace_tasks(
    workspaceId: str,
    status_filter: list[str],
    startDate: str,
    endDate: str,
) -> dict[str, Any]:
    """
    Tool callable by the agent.

    The public tool shape intentionally stays narrow. Runtime context from the
    route may further constrain the query to the active board before returning
    results to the model.
    """
    return _fetch_workspace_tasks(
        workspace_id=workspaceId,
        status_filter=status_filter,
        start_date=_date_part(startDate),
        end_date=_date_part(endDate),
    )


GET_WORKSPACE_TASKS_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_workspace_tasks",
        "description": "Fetch compact task records from the active ProJED workspace for a date range and optional statuses.",
        "parameters": {
            "type": "object",
            "properties": {
                "workspaceId": {
                    "type": "string",
                    "description": "Workspace ID supplied by the frontend context.",
                },
                "status_filter": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["todo", "in_progress", "delayed", "completed", "unsure", "onhold"],
                    },
                    "description": "Statuses to include. Use an empty array only when all statuses are needed.",
                },
                "startDate": {
                    "type": "string",
                    "description": "Inclusive ISO date or datetime lower bound.",
                },
                "endDate": {
                    "type": "string",
                    "description": "Inclusive ISO date or datetime upper bound.",
                },
            },
            "required": ["workspaceId", "status_filter", "startDate", "endDate"],
            "additionalProperties": False,
        },
    },
}


def _build_user_context_message(
    natural_language: str,
    workspace_id: str | None,
    board_id: str | None,
    current_system_time: str,
) -> str:
    return json.dumps(
        {
            "user_request": natural_language,
            "frontend_context": {
                "workspaceId": workspace_id,
                "boardId": board_id,
                "currentSystemTime": current_system_time,
            },
            "instruction": "Use the frontend workspaceId as the authoritative workspace scope.",
        },
        ensure_ascii=False,
    )


def run_agent(
    natural_language: str,
    current_system_time: str,
    workspace_id: str | None,
    board_id: str | None,
    model: str | None,
) -> AgentPlan:
    selected_model = _normalize_model(model)
    client = _get_openai_client()

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": _build_user_context_message(
                natural_language=natural_language,
                workspace_id=workspace_id,
                board_id=board_id,
                current_system_time=current_system_time,
            ),
        },
    ]

    first_response = client.chat.completions.create(
        model=selected_model,
        messages=messages,
        tools=[GET_WORKSPACE_TASKS_TOOL],
        tool_choice="auto",
        temperature=0.2,
    )

    assistant_message = first_response.choices[0].message
    tool_calls = assistant_message.tool_calls or []
    retrieved_summary: dict[str, Any] = {"tool_calls": []}

    if tool_calls:
        messages.append(assistant_message.model_dump(exclude_none=True))

        for tool_call in tool_calls[:1]:
            if tool_call.function.name != "get_workspace_tasks":
                continue

            args = json.loads(tool_call.function.arguments or "{}")
            effective_workspace_id = workspace_id or args.get("workspaceId")
            if not effective_workspace_id:
                raise ValueError("workspaceId is required for get_workspace_tasks")

            tool_result = _fetch_workspace_tasks(
                workspace_id=effective_workspace_id,
                status_filter=args.get("status_filter") or [],
                start_date=_date_part(args.get("startDate")),
                end_date=_date_part(args.get("endDate")),
                board_id=board_id,
            )
            retrieved_summary["tool_calls"].append(
                {
                    "name": "get_workspace_tasks",
                    "arguments": {
                        "workspaceId": effective_workspace_id,
                        "status_filter": args.get("status_filter") or [],
                        "startDate": args.get("startDate"),
                        "endDate": args.get("endDate"),
                        "boardId_context": board_id,
                    },
                    "returned": tool_result["returned"],
                    "truncated": tool_result["truncated"],
                }
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result, ensure_ascii=False),
                }
            )

        final_response = client.chat.completions.create(
            model=selected_model,
            messages=messages,
            temperature=0.2,
        )
        final_report = final_response.choices[0].message.content or ""
    else:
        final_report = assistant_message.content or ""

    return AgentPlan(
        original_prompt=natural_language,
        current_system_time=current_system_time,
        constraints=QueryConstraints(workspace_id=workspace_id, board_id=board_id),
        retrieved_summary=retrieved_summary,
        final_report=final_report,
        model=selected_model,
    )


def plan_to_dict(plan: AgentPlan) -> dict[str, Any]:
    return {
        **asdict(plan),
        "constraints": asdict(plan.constraints),
    }
