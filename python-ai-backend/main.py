from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from agent_logic import AgentPlan, QueryConstraints

app = FastAPI(title="ProJED AI Assistant Backend", version="0.1.0")

try:
    from openai import RateLimitError as OpenAIRateLimitError
except Exception:  # pragma: no cover - openai may not be installed in all local environments.
    OpenAIRateLimitError = None


class ChatRequest(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    natural_language: str | None = Field(default=None, min_length=1)
    workspaceId: str | None = None
    boardId: str | None = None
    currentSystemTime: str | None = None
    model: str = "gemini-3.1-flash-lite"


class ChatResponse(BaseModel):
    status: str
    message: str
    plan: dict


def _is_rate_limit_error(error: Exception) -> bool:
    if OpenAIRateLimitError is not None and isinstance(error, OpenAIRateLimitError):
        return True

    status_code = getattr(error, "status_code", None) or getattr(error, "status", None)
    if status_code == 429:
        return True

    response = getattr(error, "response", None)
    response_status = getattr(response, "status_code", None) or getattr(response, "status", None)
    return response_status == 429


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Skeleton endpoint for the frontend drawer.

    The real implementation will:
    1. turn the prompt into structured filters,
    2. read compact Firestore data through firebase_client.py,
    3. generate the final response via tool-aware agent logic.
    """
    try:
        prompt = request.text or request.natural_language
        if not prompt:
            raise HTTPException(status_code=422, detail="text is required")

        # TODO: Phase 2 - Implement strict user role validation (Technical Debt)
        plan = AgentPlan(
            original_prompt=prompt,
            current_system_time=request.currentSystemTime or "",
            constraints=QueryConstraints(
                workspace_id=request.workspaceId,
                board_id=request.boardId,
            ),
            retrieved_summary={
                "note": "backend skeleton only",
                "source": "python-ai-backend/main.py",
                "model": request.model,
            },
        )
        return ChatResponse(
            status="ok",
            message="AI assistant backend scaffold is ready. Retrieval and generation are not implemented yet.",
            plan={
                "original_prompt": plan.original_prompt,
                "current_system_time": plan.current_system_time,
                "model": request.model,
                "constraints": {
                    "date_range": plan.constraints.date_range,
                    "statuses": plan.constraints.statuses,
                    "workspace_id": plan.constraints.workspace_id,
                    "board_id": plan.constraints.board_id,
                    "keyword": plan.constraints.keyword,
                },
                "retrieved_summary": plan.retrieved_summary,
            },
        )
    except HTTPException as error:
        if error.status_code == 429:
            raise HTTPException(status_code=429, detail="Rate limit exceeded") from error
        raise
    except Exception as error:
        if _is_rate_limit_error(error):
            raise HTTPException(status_code=429, detail="Rate limit exceeded") from error
        raise
