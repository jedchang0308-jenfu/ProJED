"""
AI agent orchestration for the ProJED assistant.

The model may reason over the user's natural-language request, but it can only
read project data through the explicit tool in this module. This keeps Firestore
access centralized and caps the amount of data sent back to the LLM.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from openai import OpenAI

from firebase_client import get_firestore_client


DEFAULT_MODEL = "gemini-3.1-flash-lite"
ALLOWED_MODELS = {"gemini-3.1-flash-lite", "gemini-3.1-flash"}
MAX_TASKS_RETURNED = 80
AI_REQUEST_TIMEOUT_SECONDS = 25.0
DEFAULT_PROVIDER_MODEL_ALIASES = {
    "gemini-3.1-flash-lite": "gemini-2.5-flash-lite",
    "gemini-3.1-flash": "gemini-2.5-flash",
}

SYSTEM_PROMPT = """
You are ProJED's AI project assistant.

You have access to currentSystemTime from the frontend. When the user asks for
a time window such as "last week", "past month", or "this month", compute exact
startDate and endDate using currentSystemTime as the reference, then call
get_workspace_tasks with those ISO timestamps.

Rules:
- You must use tools for project/task facts. Do not invent project status.
- Query only the active workspace scope supplied by the frontend.
- When the user asks about changes, progress, "what changed", "recent updates",
  or compares a past time window with now, call get_workspace_changes first.
- If get_workspace_changes returns no events, say that no change history was
  recorded for that period instead of pretending that current tasks are changes.
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
        return OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=AI_REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
    return OpenAI(api_key=api_key, timeout=AI_REQUEST_TIMEOUT_SECONDS, max_retries=0)


def _normalize_model(model: str | None) -> str:
    if model in ALLOWED_MODELS:
        return model
    return DEFAULT_MODEL


def _provider_model_name(model: str) -> str:
    env_key = f"AI_MODEL_{model.upper().replace('-', '_').replace('.', '_')}"
    return os.getenv(env_key) or DEFAULT_PROVIDER_MODEL_ALIASES.get(model, model)


def _date_part(value: str | None) -> str:
    if not value:
        return ""
    return value[:10]


def _parse_time_ms(value: str | None, end_of_day: bool = False) -> int:
    if not value:
        return 0

    normalized = value.strip()
    if len(normalized) == 10:
        normalized = f"{normalized}T23:59:59.999+00:00" if end_of_day else f"{normalized}T00:00:00+00:00"
    elif normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


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


def _compact_change_event(event: dict[str, Any]) -> dict[str, Any]:
    before = event.get("before") or {}
    after = event.get("after") or {}
    task_title = event.get("taskTitle") or after.get("title") or before.get("title") or ""
    return {
        "id": event.get("id"),
        "entityType": event.get("entityType"),
        "action": event.get("action"),
        "taskId": event.get("taskId"),
        "taskTitle": task_title,
        "boardId": event.get("boardId"),
        "changedAt": event.get("changedAt"),
        "changedAtIso": event.get("changedAtIso"),
        "changedByEmail": event.get("changedByEmail"),
        "changedFields": event.get("changedFields") or [],
        "before": before,
        "after": after,
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


def _fetch_workspace_changes(
    workspace_id: str,
    start_date: str,
    end_date: str,
    board_id: str | None = None,
    limit: int = 120,
) -> dict[str, Any]:
    db = get_firestore_client()
    start_ms = _parse_time_ms(start_date)
    end_ms = _parse_time_ms(end_date, end_of_day=True)
    if not start_ms or not end_ms:
        raise ValueError("startDate and endDate are required for get_workspace_changes")

    logs_ref = db.collection("workspaces").document(workspace_id).collection("activityLogs")
    query = (
        logs_ref.where("changedAt", ">=", start_ms)
        .where("changedAt", "<=", end_ms)
        .order_by("changedAt", direction="DESCENDING")
        .limit(limit)
    )

    events: list[dict[str, Any]] = []
    scanned = 0
    for event_doc in query.stream():
        scanned += 1
        event = event_doc.to_dict() or {}
        event.setdefault("id", event_doc.id)
        if board_id and event.get("boardId") != board_id:
            continue
        events.append(_compact_change_event(event))

    summary: dict[str, int] = {}
    changed_fields: dict[str, int] = {}
    for event in events:
        action = event.get("action") or "unknown"
        summary[action] = summary.get(action, 0) + 1
        for field_name in event.get("changedFields") or []:
            changed_fields[field_name] = changed_fields.get(field_name, 0) + 1

    return {
        "workspaceId": workspace_id,
        "boardId": board_id,
        "startDate": start_date,
        "endDate": end_date,
        "events": events,
        "returned": len(events),
        "scanned": scanned,
        "summary": summary,
        "changedFields": changed_fields,
        "truncated": scanned >= limit,
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


def get_workspace_changes(
    workspaceId: str,
    startDate: str,
    endDate: str,
) -> dict[str, Any]:
    """
    Tool callable by the agent for audit-style change questions.
    """
    return _fetch_workspace_changes(
        workspace_id=workspaceId,
        start_date=startDate,
        end_date=endDate,
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


GET_WORKSPACE_CHANGES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_workspace_changes",
        "description": "Fetch recorded task change events from a workspace for a date range. Use this for questions about what changed, progress, recent updates, or differences over time.",
        "parameters": {
            "type": "object",
            "properties": {
                "workspaceId": {
                    "type": "string",
                    "description": "Workspace ID supplied by the frontend context.",
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
            "required": ["workspaceId", "startDate", "endDate"],
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
    provider_model = _provider_model_name(selected_model)
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
        model=provider_model,
        messages=messages,
        tools=[GET_WORKSPACE_TASKS_TOOL, GET_WORKSPACE_CHANGES_TOOL],
        tool_choice="auto",
        temperature=0.2,
    )

    assistant_message = first_response.choices[0].message
    tool_calls = assistant_message.tool_calls or []
    retrieved_summary: dict[str, Any] = {"tool_calls": []}

    if tool_calls:
        messages.append(assistant_message.model_dump(exclude_none=True))

        for tool_call in tool_calls[:2]:
            args = json.loads(tool_call.function.arguments or "{}")
            effective_workspace_id = workspace_id or args.get("workspaceId")
            if not effective_workspace_id:
                raise ValueError("workspaceId is required for agent tools")

            if tool_call.function.name == "get_workspace_tasks":
                tool_result = _fetch_workspace_tasks(
                    workspace_id=effective_workspace_id,
                    status_filter=args.get("status_filter") or [],
                    start_date=_date_part(args.get("startDate")),
                    end_date=_date_part(args.get("endDate")),
                    board_id=board_id,
                )
            elif tool_call.function.name == "get_workspace_changes":
                tool_result = _fetch_workspace_changes(
                    workspace_id=effective_workspace_id,
                    start_date=args.get("startDate"),
                    end_date=args.get("endDate"),
                    board_id=board_id,
                )
            else:
                continue

            retrieved_summary["tool_calls"].append(
                {
                    "name": tool_call.function.name,
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
            model=provider_model,
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
