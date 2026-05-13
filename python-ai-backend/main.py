from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from agent_logic import plan_to_dict, run_agent
from firebase_client import assert_workspace_access, verify_id_token

load_dotenv()

app = FastAPI(title="ProJED AI Assistant Backend", version="0.1.0")

try:
    from openai import RateLimitError as OpenAIRateLimitError
except Exception:  # pragma: no cover - openai may not be installed in all local environments.
    OpenAIRateLimitError = None

try:
    from openai import NotFoundError as OpenAINotFoundError
except Exception:  # pragma: no cover - openai may not be installed in all local environments.
    OpenAINotFoundError = None

try:
    from openai import APITimeoutError as OpenAIAPITimeoutError
except Exception:  # pragma: no cover - openai may not be installed in all local environments.
    OpenAIAPITimeoutError = None

try:
    from google.auth.exceptions import DefaultCredentialsError
except Exception:  # pragma: no cover - firebase-admin installs google-auth in normal environments.
    DefaultCredentialsError = None


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


def _is_model_not_found_error(error: Exception) -> bool:
    if OpenAINotFoundError is not None and isinstance(error, OpenAINotFoundError):
        return True

    status_code = getattr(error, "status_code", None) or getattr(error, "status", None)
    return status_code == 404


def _is_timeout_error(error: Exception) -> bool:
    if OpenAIAPITimeoutError is not None and isinstance(error, OpenAIAPITimeoutError):
        return True
    return error.__class__.__name__ in {"APITimeoutError", "TimeoutException", "TimeoutError"}


def _is_default_credentials_error(error: Exception) -> bool:
    if DefaultCredentialsError is not None and isinstance(error, DefaultCredentialsError):
        return True
    return error.__class__.__name__ == "DefaultCredentialsError"


def _is_firebase_auth_error(error: Exception) -> bool:
    return error.__class__.__name__ in {
        "CertificateFetchError",
        "ExpiredIdTokenError",
        "InvalidIdTokenError",
        "RevokedIdTokenError",
        "UserDisabledError",
    }


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization bearer token")

    return token


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, authorization: str | None = Header(default=None)) -> ChatResponse:
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
        if not request.workspaceId:
            raise HTTPException(status_code=400, detail="workspaceId is required")

        token = _extract_bearer_token(authorization)
        claims = verify_id_token(token)
        uid = claims.get("uid") or claims.get("sub")
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid Firebase ID token")

        assert_workspace_access(request.workspaceId, uid)

        plan = run_agent(
            natural_language=prompt,
            current_system_time=request.currentSystemTime or "",
            workspace_id=request.workspaceId,
            board_id=request.boardId,
            model=request.model,
        )
        return ChatResponse(
            status="ok",
            message=plan.final_report,
            plan=plan_to_dict(plan),
        )
    except HTTPException as error:
        if error.status_code == 429:
            raise HTTPException(status_code=429, detail="Rate limit exceeded") from error
        raise
    except Exception as error:
        if _is_rate_limit_error(error):
            raise HTTPException(status_code=429, detail="Rate limit exceeded") from error
        if _is_model_not_found_error(error):
            raise HTTPException(status_code=503, detail="Configured AI model is not available") from error
        if _is_timeout_error(error):
            raise HTTPException(status_code=504, detail="AI provider request timed out") from error
        if _is_firebase_auth_error(error):
            raise HTTPException(status_code=401, detail="Invalid or expired Firebase ID token") from error
        if isinstance(error, PermissionError):
            raise HTTPException(status_code=403, detail=str(error)) from error
        if _is_default_credentials_error(error):
            raise HTTPException(
                status_code=503,
                detail="Firebase ADC is not configured. Run gcloud auth application-default login.",
            ) from error
        if isinstance(error, RuntimeError) and "AI_API_KEY" in str(error):
            raise HTTPException(
                status_code=503,
                detail="AI provider is not configured. Set AI_API_KEY and AI_BASE_URL in python-ai-backend/.env.",
            ) from error
        raise
