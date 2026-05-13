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

## Production Deployment

Recommended production topology:

- Firebase Hosting serves the React app.
- Cloud Run serves this FastAPI backend as `projed-ai-backend` in `asia-east1`.
- Firebase Hosting rewrites `/api/**` to Cloud Run.

Cloud Run runtime requirements:

- `GOOGLE_CLOUD_PROJECT=projed-cc78d`
- `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`
- `AI_API_KEY` stored in Secret Manager

Example deploy flow:

```powershell
gcloud run deploy projed-ai-backend `
  --source .\python-ai-backend `
  --region asia-east1 `
  --allow-unauthenticated `
  --set-env-vars GOOGLE_CLOUD_PROJECT=projed-cc78d,AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ `
  --set-secrets AI_API_KEY=AI_API_KEY:latest
```

After Cloud Run is ready, deploy Hosting from the project root:

```powershell
npm run build
firebase deploy --only hosting
```
