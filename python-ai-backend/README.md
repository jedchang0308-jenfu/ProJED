# ProJED Python AI Backend

FastAPI microservice for the ProJED AI assistant. During local development, the React dev server proxies `/api/*` requests to this service at `http://127.0.0.1:8000`.

## Local Setup

```powershell
cd python-ai-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## AI Provider

The backend uses the OpenAI-compatible SDK interface. Configure these environment variables before starting the service:

```powershell
$env:AI_API_KEY="your-api-key"
$env:AI_BASE_URL="https://your-openai-compatible-endpoint/v1"
```

`AI_BASE_URL` is optional when using the default OpenAI endpoint. The frontend model names are passed through as-is, so the configured provider must support `gemini-3.1-flash-lite` and `gemini-3.1-flash`, or expose compatible aliases.

From the project root, you can also start the backend with:

```powershell
npm run dev:ai
```

Run the React app separately from the project root:

```powershell
npm run dev
```

The frontend should keep using relative API paths such as `/api/chat`; Vite handles local proxying.
