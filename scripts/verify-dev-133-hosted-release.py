"""Exercise DEV-133 quick-task Auth and owner sync on an already-running HTTPS release.

This driver connects to the task-owned Chrome CDP endpoint on loopback port 4195.
It creates only its own page, never closes the browser or pre-existing pages, and
keeps the owned tab when a human must finish Google authentication or a case fails.
"""

import argparse
import asyncio
import base64
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright


CDP_ENDPOINT = "http://127.0.0.1:4195"
ACTOR_PICKER_TEXT = "jedchang0308@jenfu.com.tw"
TEST_PROJECT_REF = "fhisnnufoeulxqrchldf"
PRODUCTION_PROJECT_REF = "knodlkxqpcqyrtgwpdst"
MAIN_PRODUCTION_ORIGIN = "https://projed-cc78d.web.app"
QUICK_PRODUCTION_ORIGIN = "https://projed-cc78d.firebaseapp.com"
QUICK_ROUTE = "/quick-task/"
CAPTURE_DB = "projed-quick-task-v1"
CAPTURE_STORE = "captures"
RPC_PATH = "/rest/v1/rpc/create_quick_unplaced_task_v1"
AUTH_USER_PATH = "/auth/v1/user"
RETENTION_MS = 7 * 24 * 60 * 60 * 1000


class DriverFailure(Exception):
    pass


class HumanRequired(Exception):
    pass


class NetworkMonitor:
    def __init__(self, label):
        self.label = label
        self.stage = "connect"
        self.offline = False
        self.fixture_title = None
        self.page_errors = []
        self.critical = []
        self.expected_offline_failures = []
        self.auth_user_statuses = []
        self.rpc_statuses = []

    def attach(self, page):
        page.on("pageerror", self._page_error)
        page.on("response", self._response)
        page.on("requestfailed", self._request_failed)

    @staticmethod
    def _path(url):
        try:
            return urlsplit(url).path
        except Exception:
            return ""

    def _page_error(self, error):
        self.page_errors.append(sanitize_first_line(str(error), self.fixture_title))

    def _response(self, response):
        path = self._path(response.url)
        if path.endswith(AUTH_USER_PATH):
            self.auth_user_statuses.append(int(response.status))
            if int(response.status) != 200:
                self.critical.append({
                    "area": "auth-v1-user",
                    "stage": self.stage,
                    "status": int(response.status),
                })
        elif path.endswith(RPC_PATH):
            self.rpc_statuses.append(int(response.status))
            if int(response.status) < 200 or int(response.status) >= 300:
                self.critical.append({
                    "area": "quick-capture-rpc",
                    "stage": self.stage,
                    "status": int(response.status),
                })

    def _request_failed(self, request):
        path = self._path(request.url)
        if not (path.endswith(AUTH_USER_PATH) or path.endswith(RPC_PATH)):
            return
        item = {
            "area": "auth-v1-user" if path.endswith(AUTH_USER_PATH) else "quick-capture-rpc",
            "stage": self.stage,
            "firstLine": sanitize_first_line(request.failure or "NETWORK_REQUEST_FAILED", self.fixture_title),
        }
        if self.offline:
            self.expected_offline_failures.append(item)
        else:
            self.critical.append(item)


def sanitize_first_line(value, fixture_title=None):
    line = str(value or "UNKNOWN").splitlines()[0][:220]
    if fixture_title:
        line = line.replace(fixture_title, "[title]")
    line = line.replace(ACTOR_PICKER_TEXT, "[email]")
    line = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[token]", line)
    line = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email]", line, flags=re.IGNORECASE)
    line = re.sub(r"\btask_workbench_unplaced_[0-9a-f-]{20,}\b", "[capture-id]", line, flags=re.IGNORECASE)
    line = re.sub(r"\b[0-9a-f]{8}-[0-9a-f-]{27,}\b", "[id]", line, flags=re.IGNORECASE)
    line = re.sub(r"https?://\S+", "[url]", line)
    return line


def origin_of(url):
    parsed = urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def safe_url_id(url):
    parsed = urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        return "about:blank"
    path = parsed.path or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def validate_https_origin(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise DriverFailure("URL_MUST_BE_HTTPS_ORIGIN")
    return f"https://{parsed.hostname.lower()}"


def validate_public_key(key):
    if not isinstance(key, str) or not key or len(key) > 4096:
        raise DriverFailure("PUBLIC_KEY_INVALID")
    lower = key.lower()
    if "service_role" in lower or "sb_secret_" in lower or lower.startswith("sb_secret_"):
        raise DriverFailure("PRIVILEGED_KEY_REJECTED")
    if key.startswith("sb_publishable_"):
        return
    if not key.startswith("eyJ") or key.count(".") < 2:
        raise DriverFailure("PUBLIC_KEY_TYPE_UNSUPPORTED")
    try:
        payload = key.split(".")[1]
        payload += "=" * ((4 - len(payload) % 4) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
    except Exception as error:
        raise DriverFailure("PUBLIC_KEY_CLAIMS_INVALID") from error
    if claims.get("role") != "anon":
        raise DriverFailure("PRIVILEGED_KEY_REJECTED")


def load_public_config(out_dir, phase):
    path = out_dir / "public-config.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        raise DriverFailure("PUBLIC_CONFIG_UNREADABLE") from error
    if not isinstance(data, dict):
        raise DriverFailure("PUBLIC_CONFIG_INVALID")
    supabase_url = data.get("url")
    public_key = data.get("key")
    project_ref = data.get("projectRef")
    if not isinstance(supabase_url, str) or not isinstance(project_ref, str):
        raise DriverFailure("PUBLIC_CONFIG_FIELDS_INVALID")
    parsed = urlsplit(supabase_url)
    expected_ref = TEST_PROJECT_REF if phase == "level3" else PRODUCTION_PROJECT_REF
    if (
        parsed.scheme != "https"
        or parsed.hostname != f"{expected_ref}.supabase.co"
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or project_ref != expected_ref
    ):
        raise DriverFailure("SUPABASE_TARGET_MISMATCH")
    validate_public_key(public_key)
    return {
        "supabaseUrl": f"https://{expected_ref}.supabase.co",
        "publicKey": public_key,
        "projectRef": expected_ref,
        "expectedMainScript": data.get("expectedMainScript"),
        "expectedQuickScript": data.get("expectedQuickScript"),
    }


def resolve_origins(phase, url):
    requested = validate_https_origin(url)
    if phase == "level3":
        host = urlsplit(requested).hostname or ""
        if not (
            host.startswith("projed-cc78d--level3-smoke-")
            and host.endswith(".web.app")
        ):
            raise DriverFailure("LEVEL3_PREVIEW_ORIGIN_REQUIRED")
        return requested, requested
    if requested != MAIN_PRODUCTION_ORIGIN:
        raise DriverFailure("CANONICAL_PRODUCTION_ORIGIN_REQUIRED")
    return QUICK_PRODUCTION_ORIGIN, MAIN_PRODUCTION_ORIGIN


def fixture_fingerprint(rows, excluded_ids):
    compact = []
    for row in rows:
        if row.get("captureId") in excluded_ids:
            continue
        compact.append({
            "captureId": row.get("captureId"),
            "accountHash": row.get("accountHash"),
            "state": row.get("state"),
            "titleHash": row.get("titleHash"),
            "updatedAt": row.get("updatedAt"),
            "hasLease": row.get("hasLease"),
            "receiptCaptureId": row.get("receiptCaptureId"),
            "receiptOwnerHash": row.get("receiptOwnerHash"),
            "receiptTitleHash": row.get("receiptTitleHash"),
            "receiptValid": row.get("receiptValid"),
        })
    compact.sort(key=lambda item: item.get("captureId") or "")
    encoded = json.dumps(compact, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def pending_count(rows):
    return sum(1 for row in rows if row.get("state") != "synced")


RAW_SNAPSHOT_JS = r"""
async () => {
  const digest = async value => {
    const bytes = new TextEncoder().encode(String(value));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  };
  const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : null;
  if (!databases) return { supported: false, exists: false, rows: [], expirableCount: 0 };
  if (!databases.some(item => item.name === 'projed-quick-task-v1')) {
    return { supported: true, exists: false, rows: [], expirableCount: 0 };
  }
  const records = await new Promise((resolve, reject) => {
    const opening = indexedDB.open('projed-quick-task-v1');
    opening.onerror = () => reject(new Error('RAW_IDB_OPEN_FAILED'));
    opening.onsuccess = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains('captures')) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction('captures', 'readonly');
      const request = tx.objectStore('captures').getAll();
      tx.oncomplete = () => {
        const result = request.result || [];
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(new Error('RAW_IDB_READ_FAILED'));
      };
    };
  });
  const now = Date.now();
  const rows = [];
  let expirableCount = 0;
  for (const record of records) {
    const titleHash = await digest(record.title || '');
    const receipt = record.receipt || null;
    const receiptValid = Boolean(
      receipt
      && receipt.status === 'committed'
      && receipt.captureId === record.captureId
      && receipt.ownerId === record.accountId
      && receipt.titleHash === titleHash
    );
    const oldSyncedCandidate = record.state === 'synced'
      && !record.leaseId
      && Number.isSafeInteger(record.updatedAt)
      && record.updatedAt > 0
      && record.updatedAt <= now
      && now - record.updatedAt >= 7 * 24 * 60 * 60 * 1000
      && receiptValid;
    if (oldSyncedCandidate) expirableCount += 1;
    rows.push({
      captureId: record.captureId,
      accountHash: record.accountId ? await digest(record.accountId) : null,
      state: record.state,
      titleHash,
      updatedAt: record.updatedAt,
      hasLease: Boolean(record.leaseId),
      receiptCaptureId: receipt ? receipt.captureId : null,
      receiptOwnerHash: receipt && receipt.ownerId ? await digest(receipt.ownerId) : null,
      receiptTitleHash: receipt ? receipt.titleHash : null,
      receiptValid,
    });
  }
  return { supported: true, exists: true, rows, expirableCount };
}
"""


IDENTITY_AND_ROW_JS = r"""
async input => {
  const digest = async value => {
    const bytes = new TextEncoder().encode(String(value));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  };
  const storageKey = 'sb-' + input.projectRef + '-auth-token';
  const candidateKeys = [storageKey].concat(
    Object.keys(localStorage).filter(key =>
      key.startsWith('sb-' + input.projectRef + '-') && key.endsWith('-auth-token')
    )
  );
  let session = null;
  for (const key of [...new Set(candidateKeys)]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      const value = parsed && (parsed.currentSession || parsed);
      if (value && typeof value.access_token === 'string') {
        session = value;
        break;
      }
    } catch {
      // Invalid/stale local storage is reported as no usable session.
    }
  }
  if (!session) return { sessionPresent: false };
  let claims;
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4)));
  } catch {
    return { sessionPresent: true, tokenClaimsValid: false };
  }
  const authResponse = await fetch(input.supabaseUrl + '/auth/v1/user', {
    method: 'GET',
    headers: {
      apikey: input.publicKey,
      Authorization: 'Bearer ' + session.access_token,
      Accept: 'application/json',
    },
    credentials: 'omit',
    cache: 'no-store',
  });
  let authUserId = null;
  let actorMatches = false;
  try {
    const body = await authResponse.json();
    authUserId = typeof body.id === 'string' ? body.id : null;
    actorMatches = typeof body.email === 'string'
      && body.email.toLowerCase() === String(input.actorEmail || '').toLowerCase();
  } catch {
    authUserId = null;
    actorMatches = false;
  }
  const ownerHash = authUserId ? await digest(authUserId) : null;
  const claimOwnerHash = typeof claims.sub === 'string' ? await digest(claims.sub) : null;
  const sessionHash = typeof claims.session_id === 'string' ? await digest(claims.session_id) : null;
  const result = {
    sessionPresent: true,
    tokenClaimsValid: true,
    authStatus: authResponse.status,
    ownerHash,
    claimOwnerHash,
    sessionHash,
    ownerMatches: Boolean(ownerHash && claimOwnerHash && ownerHash === claimOwnerHash),
    actorMatches,
  };
  if (input.captureId) {
    const query = new URL(input.supabaseUrl + '/rest/v1/task_workbench_unplaced_items');
    query.searchParams.set('select', 'id,owner_id');
    query.searchParams.set('id', 'eq.' + input.captureId);
    const rowResponse = await fetch(query.toString(), {
      method: 'GET',
      headers: {
        apikey: input.publicKey,
        Authorization: 'Bearer ' + session.access_token,
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
    });
    let rows = [];
    try {
      const body = await rowResponse.json();
      rows = Array.isArray(body) ? body : [];
    } catch {
      rows = [];
    }
    result.rowStatus = rowResponse.status;
    result.rowCount = rows.length;
    result.rowOwnerMatches = rows.length > 0 && rows.every(row =>
      row.id === input.captureId && row.owner_id === authUserId
    );
  }
  return result;
}
"""


WORKBENCH_VISIBLE_JS = r"""
captureId => Array.from(document.querySelectorAll('[data-task-canonical-id]')).some(element => {
  if (element.getAttribute('data-task-canonical-id') !== captureId) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
})
"""


def fresh_result(args, quick_origin, main_origin, public_config):
    return {
        "devId": "DEV-133",
        "phase": args.phase,
        "status": "RUNNING",
        "sanitizedStage": "initializing",
        "cases": [],
        "counts": {},
        "errorKind": None,
        "fixtures": {},
        "baseline": None,
        "ownedTab": {
            "targetId": None,
            "url": "about:blank",
            "preserved": True,
            "reason": "running",
        },
        "origins": {
            "quick": quick_origin,
            "main": main_origin,
            "supabaseProjectRef": public_config["projectRef"],
        },
        "resume": {"mode": "new-owned-tab"},
    }


class Driver:
    def __init__(self, args, out_dir, quick_origin, main_origin, config, result):
        self.args = args
        self.out_dir = out_dir
        self.quick_origin = quick_origin
        self.main_origin = main_origin
        self.config = config
        self.result = result
        self.playwright = None
        self.browser = None
        self.context = None
        self.quick = None
        self.main = None
        self.monitor = None
        self.offline_cdp = None
        self.fixture_title = None
        self.main_identity_initial = None

    def stage(self, value):
        self.result["sanitizedStage"] = value
        if self.monitor:
            self.monitor.stage = value
        self.write_result()
        print(json.dumps({"stage": value}, ensure_ascii=False), flush=True)

    def write_result(self):
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.result["counts"]["caseCount"] = len(self.result.get("cases", []))
        self.result["counts"]["passCount"] = sum(1 for case in self.result.get("cases", []) if case.get("pass"))
        self.result["counts"]["failCount"] = sum(1 for case in self.result.get("cases", []) if not case.get("pass"))
        if self.monitor:
            self.result["counts"]["expectedOfflineNetworkFailures"] = len(self.monitor.expected_offline_failures)
            self.result["network"] = {
                "quickAuthV1UserStatuses": list(self.monitor.auth_user_statuses),
                "quickCreateRpcStatuses": list(self.monitor.rpc_statuses),
                "criticalFailures": list(self.monitor.critical),
                "pageErrors": list(self.monitor.page_errors),
                "expectedOfflineFailures": list(self.monitor.expected_offline_failures),
            }
        (self.out_dir / "result.json").write_text(
            json.dumps(self.result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def case(self, name, passed):
        cases = self.result.setdefault("cases", [])
        existing = next((item for item in cases if item.get("case") == name), None)
        item = {"case": name, "pass": bool(passed)}
        if existing:
            existing.clear()
            existing.update(item)
        else:
            cases.append(item)
        self.write_result()
        if not passed:
            raise DriverFailure("CASE_FAILED")

    def fixture(self, key):
        value = self.result.setdefault("fixtures", {}).get(key)
        return value if isinstance(value, dict) else None

    async def target_id(self, page):
        session = await page.context.new_cdp_session(page)
        try:
            result = await session.send("Target.getTargetInfo")
            return result.get("targetInfo", {}).get("targetId")
        finally:
            await session.detach()

    async def attach_or_create_owned_page(self, old_result):
        contexts = self.browser.contexts
        if not contexts:
            raise DriverFailure("CDP_CONTEXT_MISSING")

        prior_tab = old_result.get("ownedTab") if isinstance(old_result, dict) else None
        prior_target = prior_tab.get("targetId") if isinstance(prior_tab, dict) else None
        prior_status = old_result.get("status") if isinstance(old_result, dict) else None
        prior_fixtures = old_result.get("fixtures") if isinstance(old_result, dict) else None
        has_prior_fixture = isinstance(prior_fixtures, dict) and bool(prior_fixtures)
        may_resume = prior_status in {"AWAITING_HUMAN", "RUNNING", "FAIL"}

        if old_result and old_result.get("phase") != self.args.phase:
            if has_prior_fixture:
                raise DriverFailure("OUTPUT_PHASE_MISMATCH_WITH_FIXTURE")
        if old_result and old_result.get("origins", {}).get("quick") != self.quick_origin:
            if has_prior_fixture:
                raise DriverFailure("OUTPUT_ORIGIN_MISMATCH_WITH_FIXTURE")

        if may_resume and prior_target:
            for context in contexts:
                for page in context.pages:
                    try:
                        if await self.target_id(page) == prior_target:
                            self.context = context
                            self.quick = page
                            self.result = old_result
                            self.result["status"] = "RUNNING"
                            self.result["errorKind"] = None
                            self.result["resume"] = {"mode": "resumed-owned-tab", "previousStatus": prior_status}
                            self.write_result()
                            return
                    except Exception:
                        continue
            if has_prior_fixture or prior_status == "AWAITING_HUMAN":
                raise DriverFailure("OWNED_TAB_NOT_FOUND_NO_NEW_FIXTURE")

        if old_result and prior_status == "PASS":
            raise DriverFailure("OUTPUT_ALREADY_PASS_USE_NEW_OUT_DIRECTORY")
        if has_prior_fixture:
            raise DriverFailure("OUTPUT_HAS_FIXTURE_BUT_NO_RESUMABLE_TAB")

        if self.args.phase == "production":
            for context in contexts:
                if any(origin_of(page.url) == self.main_origin for page in context.pages):
                    self.context = context
                    break
        if self.context is None:
            self.context = contexts[0]
        self.quick = await self.context.new_page()
        await self.quick.set_viewport_size({"width": 390, "height": 844})
        target = await self.target_id(self.quick)
        self.result["ownedTab"]["targetId"] = target
        self.result["ownedTab"]["url"] = safe_url_id(self.quick.url)
        self.result["ownedTab"]["preserved"] = True
        self.result["ownedTab"]["reason"] = "task-owned-test-tab"
        self.result["resume"] = {"mode": "new-owned-tab"}
        self.write_result()

    async def find_existing_main(self):
        if self.args.phase != "production":
            return None
        candidates = []
        for context in self.browser.contexts:
            for page in context.pages:
                if page == self.quick:
                    continue
                if origin_of(page.url) == self.main_origin and not urlsplit(page.url).path.startswith(QUICK_ROUTE):
                    candidates.append((context, page))
        for context, page in candidates:
            identity = await self.identity(page)
            if identity.get("sessionPresent") and identity.get("authStatus") == 200 and identity.get("ownerMatches") and identity.get("actorMatches"):
                self.context = context
                self.main = page
                self.main_identity_initial = identity
                return page
        raise DriverFailure("EXISTING_CANONICAL_MAIN_SESSION_REQUIRED")

    async def identity(self, page, capture_id=None):
        result = await page.evaluate(
            IDENTITY_AND_ROW_JS,
            {
                **self.config,
                "captureId": capture_id,
                "actorEmail": ACTOR_PICKER_TEXT,
            },
        )
        return result

    async def verify_pinned_document(self, mode):
        if self.args.phase != "production":
            return False
        expected = self.config.get("expectedMainScript" if mode == "main" else "expectedQuickScript")
        if not expected:
            raise DriverFailure("PINNED_DOCUMENT_SCRIPT_MISSING")
        matches = await self.quick.evaluate(
            "expected => Array.from(document.querySelectorAll('script[src]')).some(s => new URL(s.src).pathname === expected)",
            expected,
        )
        was_stale = not matches
        if was_stale:
            self.stage("wait-normal-pwa-update-" + mode)
            await self.quick.wait_for_function(
                "expected => Array.from(document.querySelectorAll('script[src]')).some(s => new URL(s.src).pathname === expected) || Array.from(document.querySelectorAll('[data-pwa-cache-recovery], [data-pwa-update-action]')).some(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0)",
                arg=expected, timeout=25000,
            )
            await self.close_visible_install_assistant()
            recovery = self.quick.locator('[data-pwa-cache-recovery]')
            action = self.quick.locator('[data-pwa-update-action]')
            if mode == "main" and await recovery.count() and await recovery.is_visible():
                before_recovery = await self.identity(self.quick)
                if before_recovery.get("authStatus") != 200:
                    raise DriverFailure("CACHE_RECOVERY_REQUIRES_VALID_OWN_SESSION")
                await recovery.click()
                self.result["normalCacheRecovery"] = {
                    "scope": "task-owned main origin Cache Storage/SW only; product handler preserves IDB/localStorage",
                    "sessionHashBefore": before_recovery.get("sessionHash"),
                }
                self.case("normal-main-cache-recovery-entry-used", True)
            elif await action.count() and await action.is_visible():
                await action.click()
            await self.quick.wait_for_function(
                "expected => Array.from(document.querySelectorAll('script[src]')).some(s => new URL(s.src).pathname === expected)",
                arg=expected, timeout=45000,
            )
            matches = True
        self.case(mode + "-document-serves-pinned-release-script", matches)
        return was_stale

    async def raw_snapshot(self, page=None):
        target = page or self.quick
        return await target.evaluate(RAW_SNAPSHOT_JS)

    async def preflight_existing_data(self):
        if self.result.get("baseline"):
            return
        self.stage("read-only-quick-origin-preflight")
        response = await self.quick.goto(
            self.quick_origin + "/manifest.webmanifest",
            wait_until="domcontentloaded",
            timeout=45000,
        )
        content_type = (response.headers.get("content-type", "") if response else "").lower()
        self.case(
            "quick-origin-static-preflight-resource",
            bool(response and response.status == 200 and "json" in content_type),
        )
        snapshot = await self.raw_snapshot()
        self.case("raw-idb-preflight-supported", bool(snapshot.get("supported")))
        rows = snapshot.get("rows", [])
        preexisting_pending = pending_count(rows)
        expirable = int(snapshot.get("expirableCount", 0))
        self.result["counts"]["rawCapturesBeforeAppLoad"] = len(rows)
        self.result["counts"]["preexistingPendingBeforeAppLoad"] = preexisting_pending
        self.result["counts"]["potentialRetentionCleanupBeforeAppLoad"] = expirable
        self.case("no-preexisting-pending-captures-to-disturb", preexisting_pending == 0)
        self.case("no-preexisting-capture-eligible-for-retention-delete", expirable == 0)
        self.result["baseline"] = {
            "captureCount": len(rows),
            "fingerprint": fixture_fingerprint(rows, set()),
        }
        self.write_result()
        if preexisting_pending or expirable:
            raise DriverFailure("PRESERVE_EXISTING_QUICK_DATA")

    async def ensure_quick_route(self):
        current = origin_of(self.quick.url)
        if current in {"https://accounts.google.com"}:
            return
        supa_host = urlsplit(self.config["supabaseUrl"]).hostname
        if current == f"https://{supa_host}":
            return
        desired = self.quick_origin + QUICK_ROUTE
        if self.quick.url != desired:
            await self.quick.goto(desired, wait_until="domcontentloaded", timeout=60000)
        await self.quick.locator("#quick-task-title").wait_for(state="visible", timeout=45000)

    async def account_picker_visible(self):
        if (urlsplit(self.quick.url).hostname or "") != "accounts.google.com":
            return False
        exact = self.quick.get_by_text(ACTOR_PICKER_TEXT, exact=True)
        count = await exact.count()
        for index in range(count):
            candidate = exact.nth(index)
            try:
                if await candidate.is_visible():
                    return candidate
            except Exception:
                continue
        return False

    async def finish_google_flow(self, already_selected=False):
        deadline = asyncio.get_running_loop().time() + 90
        selected = already_selected
        google_host_since = None
        supa_host = urlsplit(self.config["supabaseUrl"]).hostname
        while asyncio.get_running_loop().time() < deadline:
            host = (urlsplit(self.quick.url).hostname or "").lower()
            if host == "accounts.google.com":
                picker = await self.account_picker_visible()
                if picker and not selected:
                    self.stage("select-authorized-existing-google-account")
                    await picker.click(timeout=10000)
                    selected = True
                    google_host_since = asyncio.get_running_loop().time()
                    continue
                if google_host_since is None:
                    google_host_since = asyncio.get_running_loop().time()
                explicit_human_step = await self.quick.locator(
                    'input[type="password"], input[type="tel"], '
                    'input[autocomplete="one-time-code"], input[name="totpPin"]'
                ).count()
                if explicit_human_step:
                    raise HumanRequired("google-password-or-mfa-needs-human")
                if asyncio.get_running_loop().time() - google_host_since >= 10:
                    raise HumanRequired("google-step-needs-human")
                await asyncio.sleep(0.4)
                continue
            google_host_since = None
            if host == supa_host:
                await asyncio.sleep(0.4)
                continue
            if origin_of(self.quick.url) == self.quick_origin and urlsplit(self.quick.url).path.startswith(QUICK_ROUTE):
                try:
                    await self.quick.locator("#quick-task-auth-status").wait_for(timeout=30000)
                except Exception:
                    pass
                identity = await self.identity(self.quick)
                if identity.get("sessionPresent") and identity.get("authStatus") == 200 and identity.get("actorMatches"):
                    return identity
                await asyncio.sleep(0.4)
                continue
            if "google.com" in host or host.endswith(".accounts.google.com"):
                raise HumanRequired("google-identity-step-needs-human")
            await asyncio.sleep(0.4)
        raise HumanRequired("google-callback-awaiting-human")

    async def ensure_quick_login(self, is_resume):
        self.stage("quick-normal-google-session")
        current_host = (urlsplit(self.quick.url).hostname or "").lower()
        if current_host == "accounts.google.com" or current_host == (urlsplit(self.config["supabaseUrl"]).hostname or ""):
            identity = await self.finish_google_flow()
            await self.ensure_quick_route()
            identity = await self.identity(self.quick)
            self.case("quick-auth-v1-user-network-verified", bool(
                identity.get("sessionPresent")
                and identity.get("authStatus") == 200
                and identity.get("ownerMatches")
                and identity.get("actorMatches")
                and identity.get("sessionHash")
            ))
            return identity

        await self.ensure_quick_route()
        await self.quick.wait_for_function(
            "() => { const s=document.querySelector('#quick-task-auth-status'); return s && !s.hidden && (s.textContent.includes('尚未登入') || s.textContent.includes('已登入')); }",
            timeout=45000,
        )
        current = await self.identity(self.quick)
        if current.get("sessionPresent"):
            if not is_resume and not self.result.get("fixtures"):
                self.case("quick-origin-starts-without-session", False)
            self.case("quick-auth-v1-user-network-verified", bool(
                current.get("authStatus") == 200
                and current.get("ownerMatches")
                and current.get("actorMatches")
                and current.get("sessionHash")
            ))
            return current

        auth_text = (await self.quick.locator("#quick-task-auth-status").inner_text()).strip()
        self.case("quick-origin-session-not-inherited-before-login", "尚未登入" in auth_text)
        self.case("quick-login-cta-visible", await self.quick.locator(
            '#quick-task-auth-status button[aria-label="登入快速建任務"]'
        ).is_visible())
        self.stage("click-normal-quick-google-login")
        login = self.quick.locator('#quick-task-auth-status button[aria-label="登入快速建任務"]')
        await login.click(timeout=15000)
        identity = await self.finish_google_flow()
        await self.ensure_quick_route()
        await self.quick.wait_for_function(
            "() => document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')",
            timeout=45000,
        )
        identity = await self.identity(self.quick)
        self.case("quick-auth-v1-user-network-verified", bool(
            identity.get("sessionPresent")
            and identity.get("authStatus") == 200
            and identity.get("ownerMatches")
            and identity.get("actorMatches")
            and identity.get("sessionHash")
        ))
        return identity

    async def create_fixture(self, key, owner_hash, expect_unbound=False):
        existing = self.fixture(key)
        if existing:
            return existing

        self.stage("normal-quick-ui-create-" + key)
        before = await self.raw_snapshot()
        rows_before = before.get("rows", [])
        self.case(key + "-no-other-pending-before-create", pending_count(rows_before) == 0)
        fixture_title = "DEV133-RELEASE-" + self.args.phase + "-" + uuid.uuid4().hex
        title_hash = hashlib.sha256(fixture_title.encode("utf-8")).hexdigest()
        self.fixture_title = fixture_title
        if await self.quick.locator("#quick-task-success [data-next]").is_visible():
            await self.quick.locator("#quick-task-success [data-next]").click()
        await self.quick.locator("#quick-task-title").fill(fixture_title)
        rpc_before = len(self.monitor.rpc_statuses)
        await self.quick.locator("#quick-task-submit").click()

        deadline = asyncio.get_running_loop().time() + 40
        created = None
        while asyncio.get_running_loop().time() < deadline:
            snapshot = await self.raw_snapshot()
            candidates = [
                row for row in snapshot.get("rows", [])
                if row.get("titleHash") == title_hash
                and row.get("captureId") not in {item.get("captureId") for item in rows_before}
            ]
            if len(candidates) == 1:
                created = candidates[0]
                break
            if len(candidates) > 1:
                raise DriverFailure("DUPLICATE_LOCAL_FIXTURE")
            await asyncio.sleep(0.25)
        if not created:
            raise DriverFailure("LOCAL_CAPTURE_NOT_CREATED")

        if expect_unbound:
            state_ok = created.get("state") == "awaiting_auth" and created.get("accountHash") is None
        else:
            state_ok = (
                created.get("accountHash") == owner_hash
                and created.get("state") in {"pending", "syncing", "synced", "failed_retryable"}
            )
        self.case(key + "-raw-idb-new-unique-capture", bool(
            created.get("captureId")
            and created.get("titleHash") == title_hash
            and state_ok
            and len(snapshot.get("rows", [])) == len(rows_before) + 1
        ))
        fixture = {
            "captureId": created["captureId"],
            "titleHash": title_hash,
        }
        self.result.setdefault("fixtures", {})[key] = fixture
        self.result["counts"][key + "RawCaptureCount"] = len(snapshot.get("rows", []))
        if expect_unbound:
            self.case(key + "-unbound-create-does-not-call-rpc", len(self.monitor.rpc_statuses) == rpc_before)
        self.write_result()
        return fixture

    async def wait_capture(self, capture_id, predicate, timeout=90):
        deadline = asyncio.get_running_loop().time() + timeout
        latest = None
        while asyncio.get_running_loop().time() < deadline:
            snapshot = await self.raw_snapshot()
            latest = next((row for row in snapshot.get("rows", []) if row.get("captureId") == capture_id), None)
            if latest and predicate(latest):
                return latest
            await asyncio.sleep(0.35)
        return latest

    async def verify_capture_synced(self, key, owner_hash):
        fixture = self.fixture(key)
        if not fixture:
            raise DriverFailure("FIXTURE_METADATA_MISSING")
        row = await self.wait_capture(
            fixture["captureId"],
            lambda item: item.get("state") == "synced" and item.get("receiptValid"),
            timeout=120,
        )
        self.case(key + "-same-id-synced-owner-receipt", bool(
            row
            and row.get("captureId") == fixture["captureId"]
            and row.get("accountHash") == owner_hash
            and row.get("state") == "synced"
            and row.get("receiptCaptureId") == fixture["captureId"]
            and row.get("receiptOwnerHash") == owner_hash
            and row.get("titleHash") == fixture["titleHash"]
            and row.get("receiptTitleHash") == fixture["titleHash"]
            and row.get("receiptValid")
        ))
        fixture["ownerHash"] = owner_hash
        self.write_result()
        return row

    async def verify_rest_row(self, page, fixture_key, expected_owner_hash):
        fixture = self.fixture(fixture_key)
        result = await self.identity(page, fixture["captureId"])
        self.case(fixture_key + "-data-api-own-row-exactly-one", bool(
            result.get("authStatus") == 200
            and result.get("ownerMatches")
            and result.get("rowStatus") == 200
            and result.get("rowCount") == 1
            and result.get("rowOwnerMatches")
            and result.get("ownerHash") == expected_owner_hash
        ))
        self.result["counts"][fixture_key + "DataApiRows"] = result.get("rowCount", 0)
        return result

    async def workbench_visible(self, capture_id, timeout=60000):
        await self.quick.wait_for_function(WORKBENCH_VISIBLE_JS, arg=capture_id, timeout=timeout)
        count = await self.quick.locator('[data-task-canonical-id="' + capture_id + '"]').count()
        self.result["counts"]["workbenchMatchingCanonicalIds"] = count
        return count > 0

    async def close_visible_install_assistant(self):
        assistant = self.quick.locator("[data-pwa-install-assistant]")
        if not await assistant.count() or not await assistant.is_visible():
            return False
        close = assistant.locator('button[aria-label="關閉加入主畫面提示"]')
        if await close.count() and await close.is_visible():
            await close.click()
            return True
        later = assistant.get_by_role("button", name="稍後", exact=True)
        if await later.count() and await later.is_visible():
            await later.click()
            return True
        raise DriverFailure("INSTALL_ASSISTANT_HAS_NO_NORMAL_CLOSE_ACTION")

    async def open_primary_workbench(self, owner_hash, owner_session_hash):
        fixture = self.fixture("primary")
        expected_url = self.main_origin + "/?quick_workbench=1"
        current_origin = origin_of(self.quick.url)
        current_path = urlsplit(self.quick.url).path
        primary_case = next(
            (item for item in self.result.get("cases", []) if item.get("case") == "primary-success-cta-to-workbench"),
            None,
        )
        if current_origin == self.quick_origin and current_path.startswith(QUICK_ROUTE):
            button = self.quick.locator("#quick-task-success [data-workbench]")
            if await button.count() and await button.is_visible():
                self.stage("normal-success-workbench-cta")
                await button.click()
                await self.quick.wait_for_url(
                    lambda value: origin_of(value) == self.main_origin and urlsplit(value).path == "/",
                    timeout=60000,
                )
                self.case("primary-success-cta-to-workbench", True)
            elif primary_case and primary_case.get("pass"):
                await self.quick.goto(expected_url, wait_until="domcontentloaded", timeout=60000)
            else:
                self.case("primary-success-cta-to-workbench", False)
        elif current_origin == self.main_origin and primary_case and primary_case.get("pass"):
            pass
        else:
            raise DriverFailure("NORMAL_SUCCESS_CTA_NOT_AVAILABLE")

        await self.close_visible_install_assistant()
        await self.quick.locator("#root").wait_for(state="attached", timeout=45000)
        updated = await self.verify_pinned_document("main")
        if updated and not await self.quick.evaluate(WORKBENCH_VISIBLE_JS, fixture["captureId"]):
            await self.quick.goto(expected_url, wait_until="domcontentloaded", timeout=60000)
            await self.close_visible_install_assistant()
            self.case("same-workbench-entry-reopened-after-normal-pwa-recovery", True)
        self.case("workbench-same-canonical-id-visible", await self.workbench_visible(fixture["captureId"]))
        main_identity = await self.identity(self.quick, fixture["captureId"])
        self.case("workbench-origin-auth-v1-user-verified", bool(
            main_identity.get("authStatus") == 200
            and main_identity.get("ownerMatches")
            and main_identity.get("actorMatches")
            and main_identity.get("ownerHash") == owner_hash
        ))
        if self.args.phase == "level3":
            self.case("same-origin-quick-and-main-sdk-session", main_identity.get("sessionHash") == owner_session_hash)
        else:
            self.case(
                "canonical-main-keeps-preexisting-sdk-session",
                bool(
                    self.main_identity_initial
                    and main_identity.get("ownerHash") == self.main_identity_initial.get("ownerHash")
                    and main_identity.get("sessionHash") == self.main_identity_initial.get("sessionHash")
                    and main_identity.get("sessionHash") != owner_session_hash
                ),
            )
        await self.verify_rest_row(self.quick, "primary", owner_hash)
        await self.quick.reload(wait_until="domcontentloaded", timeout=60000)
        await self.close_visible_install_assistant()
        await self.quick.locator("#root").wait_for(state="attached", timeout=45000)
        reloaded = await self.verify_rest_row(self.quick, "primary", owner_hash)
        self.case("workbench-reload-keeps-same-canonical-row-and-session", bool(
            reloaded.get("rowCount") == 1
            and reloaded.get("sessionHash") == main_identity.get("sessionHash")
        ))

    async def capture_screenshots(self, phase_tag):
        masks = [
            self.quick.locator("#quick-task-auth-status"),
            self.quick.locator("#quick-task-title"),
            self.quick.locator("#quick-task-success"),
            self.quick.locator("#quick-task-recovery span"),
        ]
        for width in (390, 726):
            await self.quick.set_viewport_size({"width": width, "height": 844 if width == 390 else 668})
            self.case("quick-viewport-no-overflow-" + str(width), await self.quick.evaluate(
                "() => document.documentElement.scrollWidth <= innerWidth + 1"
            ))
            await self.quick.screenshot(
                path=str(self.out_dir / (phase_tag + "-" + str(width) + ".png")),
                full_page=True,
                mask=masks,
            )
        await self.quick.set_viewport_size({"width": 390, "height": 844})

    async def do_offline_capture(self, owner_hash):
        fixture = self.fixture("offline")
        if fixture:
            return await self.verify_capture_synced("offline", owner_hash)
        self.stage("page-scoped-offline-capture")
        self.offline_cdp = await self.context.new_cdp_session(self.quick)
        await self.offline_cdp.send("Network.enable")
        await self.offline_cdp.send(
            "Network.emulateNetworkConditions",
            {
                "offline": True,
                "latency": 0,
                "downloadThroughput": 0,
                "uploadThroughput": 0,
                "connectionType": "none",
            },
        )
        self.monitor.offline = True
        await self.quick.wait_for_function("() => navigator.onLine === false", timeout=10000)
        self.case("only-owned-quick-target-is-offline", await self.quick.evaluate("() => navigator.onLine === false"))
        fixture = await self.create_fixture("offline", owner_hash)
        row = await self.wait_capture(
            fixture["captureId"],
            lambda item: item.get("accountHash") == owner_hash
            and item.get("state") != "synced"
            and item.get("receiptCaptureId") is None,
            timeout=35,
        )
        self.case("offline-capture-remains-a-bound-local-record", bool(
            row
            and row.get("captureId") == fixture["captureId"]
            and row.get("accountHash") == owner_hash
            and row.get("state") != "synced"
            and row.get("receiptCaptureId") is None
            and row.get("titleHash") == fixture["titleHash"]
        ))
        return row

    async def restore_online(self):
        if not self.offline_cdp:
            return
        try:
            await self.offline_cdp.send(
                "Network.emulateNetworkConditions",
                {
                    "offline": False,
                    "latency": 0,
                    "downloadThroughput": -1,
                    "uploadThroughput": -1,
                    "connectionType": "wifi",
                },
            )
            self.monitor.offline = False
            if self.quick and not self.quick.is_closed():
                await self.quick.wait_for_function("() => navigator.onLine === true", timeout=15000)
        finally:
            try:
                await self.offline_cdp.detach()
            except Exception:
                pass
            self.offline_cdp = None

    async def production_offline_and_logout(self, owner_hash):
        await self.ensure_quick_route()
        quick_identity = await self.identity(self.quick)
        self.case("quick-session-survives-own-workbench-navigation", bool(
            quick_identity.get("sessionPresent")
            and quick_identity.get("authStatus") == 200
            and quick_identity.get("ownerHash") == owner_hash
        ))
        await self.do_offline_capture(owner_hash)
        await self.restore_online()
        offline = await self.verify_capture_synced("offline", owner_hash)
        self.case("offline-capture-auto-syncs-same-id-online", bool(
            offline
            and offline.get("captureId") == self.fixture("offline")["captureId"]
            and offline.get("state") == "synced"
            and offline.get("receiptValid")
        ))
        await self.verify_rest_row(self.quick, "offline", owner_hash)
        await self.capture_screenshots("production-offline-synced")

        self.stage("normal-quick-local-logout")
        logout = self.quick.locator(
            '#quick-task-auth-status button[aria-label="登出此快速建任務 App"]'
        )
        self.case("quick-local-logout-cta-visible", await logout.is_visible())
        await logout.click()
        await self.quick.wait_for_function(
            "() => document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')",
            timeout=30000,
        )
        quick_after = await self.identity(self.quick)
        self.case("quick-local-session-cleared", not quick_after.get("sessionPresent"))
        final_raw = await self.raw_snapshot()
        fixture_ids = {value["captureId"] for value in self.result.get("fixtures", {}).values()}
        fixture_rows = [row for row in final_raw.get("rows", []) if row.get("captureId") in fixture_ids]
        self.result["counts"]["rawCapturesFinal"] = len(final_raw.get("rows", []))
        self.result["counts"]["pendingCapturesFinal"] = pending_count(final_raw.get("rows", []))
        self.case("all-test-fixtures-synced-no-pending-left", bool(
            len(fixture_rows) == len(fixture_ids)
            and all(row.get("state") == "synced" and row.get("receiptValid") for row in fixture_rows)
            and pending_count(final_raw.get("rows", [])) == 0
        ))
        await self.verify_baseline_preserved(final_raw.get("rows", []))
        main_after = await self.identity(self.main)
        self.case("quick-logout-keeps-canonical-main-network-session", bool(
            main_after.get("sessionPresent")
            and main_after.get("authStatus") == 200
            and main_after.get("ownerMatches")
            and main_after.get("actorMatches")
            and main_after.get("ownerHash") == self.main_identity_initial.get("ownerHash")
            and main_after.get("sessionHash") == self.main_identity_initial.get("sessionHash")
        ))

    async def verify_baseline_preserved(self, rows):
        baseline = self.result.get("baseline")
        if not baseline:
            return
        fixture_ids = {
            value.get("captureId")
            for value in self.result.get("fixtures", {}).values()
            if value.get("captureId")
        }
        actual = fixture_fingerprint(rows, fixture_ids)
        self.case("all-preexisting-raw-captures-preserved", actual == baseline.get("fingerprint"))

    async def level3_flow(self, quick_identity):
        self.stage("level3-create-and-sync")
        fixture = await self.create_fixture("primary", quick_identity["ownerHash"])
        await self.verify_capture_synced("primary", quick_identity["ownerHash"])
        await self.capture_screenshots("level3-synced")
        await self.open_primary_workbench(
            quick_identity["ownerHash"],
            quick_identity["sessionHash"],
        )
        await self.verify_baseline_preserved((await self.raw_snapshot()).get("rows", []))
        self.result["counts"]["level3PrimaryCaptureCount"] = 1

    async def production_flow(self, quick_identity):
        self.stage("production-cross-origin-session-comparison")
        self.case("main-and-quick-share-owner-different-sdk-session", bool(
            self.main_identity_initial
            and self.main_identity_initial.get("ownerHash") == quick_identity.get("ownerHash")
            and self.main_identity_initial.get("sessionHash")
            and quick_identity.get("sessionHash")
            and self.main_identity_initial.get("sessionHash") != quick_identity.get("sessionHash")
        ))
        fixture = await self.create_fixture("primary", quick_identity["ownerHash"])
        await self.verify_capture_synced("primary", quick_identity["ownerHash"])
        await self.capture_screenshots("production-primary-synced")
        await self.open_primary_workbench(
            quick_identity["ownerHash"],
            quick_identity["sessionHash"],
        )
        await self.quick.goto(self.quick_origin + QUICK_ROUTE, wait_until="domcontentloaded", timeout=60000)
        await self.quick.locator("#quick-task-title").wait_for(state="visible", timeout=45000)
        await self.production_offline_and_logout(quick_identity["ownerHash"])
        await self.verify_baseline_preserved((await self.raw_snapshot()).get("rows", []))

    def finalize_network_cases(self):
        if not self.monitor:
            return
        first_error = self.monitor.page_errors[0] if self.monitor.page_errors else None
        self.result["counts"]["pageErrorCount"] = len(self.monitor.page_errors)
        self.result["counts"]["criticalAuthOrRpcFailureCount"] = len(self.monitor.critical)
        self.result["counts"]["expectedOfflineNetworkFailures"] = len(self.monitor.expected_offline_failures)
        self.result["firstBrowserError"] = first_error
        self.result["criticalAuthOrRpcFailures"] = list(self.monitor.critical)
        self.case("no-browser-page-errors", not self.monitor.page_errors)
        self.case("no-critical-auth-or-rpc-failures", not self.monitor.critical)

    async def run(self, old_result):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.connect_over_cdp(CDP_ENDPOINT)
        await self.attach_or_create_owned_page(old_result)
        self.result["ownedTab"]["targetId"] = await self.target_id(self.quick)
        self.result["ownedTab"]["url"] = safe_url_id(self.quick.url)
        self.monitor = NetworkMonitor("owned-quick-tab")
        self.monitor.attach(self.quick)

        if self.args.phase == "production":
            await self.find_existing_main()
            main_identity = self.main_identity_initial
            self.case("canonical-main-session-already-valid", bool(
                main_identity
                and main_identity.get("sessionPresent")
                and main_identity.get("authStatus") == 200
                and main_identity.get("ownerMatches")
                and main_identity.get("actorMatches")
                and main_identity.get("sessionHash")
            ))
            self.monitor.attach(self.main)

        if not self.result.get("baseline"):
            current_host = (urlsplit(self.quick.url).hostname or "").lower()
            if current_host not in {"accounts.google.com", urlsplit(self.config["supabaseUrl"]).hostname}:
                await self.preflight_existing_data()
        if current_host := (urlsplit(self.quick.url).hostname or "").lower():
            if current_host not in {"accounts.google.com", urlsplit(self.config["supabaseUrl"]).hostname}:
                await self.ensure_quick_route()

        is_resume = self.result.get("resume", {}).get("mode") == "resumed-owned-tab"
        quick_identity = await self.ensure_quick_login(is_resume)
        await self.verify_pinned_document("quick")
        self.write_result()
        if self.args.phase == "production":
            self.case("ordinary-a-owner-matches-main-session-owner", bool(
                self.main_identity_initial
                and quick_identity.get("ownerHash") == self.main_identity_initial.get("ownerHash")
                and quick_identity.get("actorMatches")
                and self.main_identity_initial.get("actorMatches")
            ))
            await self.production_flow(quick_identity)
        else:
            await self.level3_flow(quick_identity)

        self.finalize_network_cases()
        self.result["status"] = "PASS"
        self.result["errorKind"] = None
        if self.result.get("failureFirstLine"):
            self.result["previousAttemptFailureFirstLine"] = self.result.pop("failureFirstLine")
        self.result["sanitizedStage"] = "complete"
        self.result["ownedTab"]["url"] = safe_url_id(self.quick.url)
        self.result["ownedTab"]["preserved"] = False
        self.result["ownedTab"]["reason"] = "closed-after-pass"
        await self.quick.close()
        self.write_result()
        return 0

    async def close_connection(self):
        if self.offline_cdp:
            try:
                await self.restore_online()
            except Exception:
                self.result["counts"]["onlineRestoreFailure"] = 1
        if self.playwright:
            try:
                await self.playwright.stop()
            except Exception:
                pass


def load_prior_result(out_dir):
    path = out_dir / "result.json"
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        raise DriverFailure("PRIOR_RESULT_UNREADABLE") from error
    if not isinstance(value, dict):
        raise DriverFailure("PRIOR_RESULT_INVALID")
    return value


async def main_async(args):
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    result = None
    driver = None
    exit_code = 1
    try:
        quick_origin, main_origin = resolve_origins(args.phase, args.url)
        config = load_public_config(out_dir, args.phase)
        old_result = load_prior_result(out_dir)
        if old_result and old_result.get("status") == "PASS":
            raise DriverFailure("OUTPUT_ALREADY_PASS_USE_NEW_OUT_DIRECTORY")
        result = old_result or fresh_result(args, quick_origin, main_origin, config)
        result["phase"] = args.phase
        result.setdefault("origins", {
            "quick": quick_origin,
            "main": main_origin,
            "supabaseProjectRef": config["projectRef"],
        })
        result["status"] = "RUNNING"
        driver = Driver(args, out_dir, quick_origin, main_origin, config, result)
        exit_code = await driver.run(old_result)
    except HumanRequired as error:
        if driver:
            driver.result["status"] = "AWAITING_HUMAN"
            driver.result["errorKind"] = "HUMAN_REQUIRED"
            driver.result["sanitizedStage"] = sanitize_first_line(str(error))
            if driver.quick and not driver.quick.is_closed():
                driver.result["ownedTab"]["url"] = safe_url_id(driver.quick.url)
                driver.result["ownedTab"]["preserved"] = True
                driver.result["ownedTab"]["reason"] = driver.result["sanitizedStage"]
            driver.write_result()
        elif result:
            result["status"] = "AWAITING_HUMAN"
            result["errorKind"] = "HUMAN_REQUIRED"
            result["sanitizedStage"] = sanitize_first_line(str(error))
            (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        exit_code = 2
    except Exception as error:
        if driver:
            driver.result["status"] = "FAIL"
            driver.result["errorKind"] = type(error).__name__ if not isinstance(error, DriverFailure) else sanitize_first_line(str(error))
            driver.result["failureFirstLine"] = sanitize_first_line(str(error), driver.fixture_title)
            driver.result["sanitizedStage"] = driver.result.get("sanitizedStage", "failed")
            if driver.quick and not driver.quick.is_closed():
                driver.result["ownedTab"]["url"] = safe_url_id(driver.quick.url)
                driver.result["ownedTab"]["preserved"] = True
                driver.result["ownedTab"]["reason"] = "failure-preserved-for-resume"
            driver.write_result()
        else:
            if result is None:
                result = {
                    "devId": "DEV-133",
                    "phase": args.phase,
                    "status": "FAIL",
                    "cases": [],
                    "counts": {"caseCount": 0, "passCount": 0, "failCount": 0},
                    "errorKind": type(error).__name__ if not isinstance(error, DriverFailure) else sanitize_first_line(str(error)),
                    "sanitizedStage": "preflight",
                    "fixtures": {},
                    "ownedTab": {"targetId": None, "url": "about:blank", "preserved": False, "reason": "no-tab-created"},
                }
            else:
                result["status"] = "FAIL"
                result["errorKind"] = type(error).__name__ if not isinstance(error, DriverFailure) else sanitize_first_line(str(error))
                result["sanitizedStage"] = result.get("sanitizedStage", "preflight")
            (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        exit_code = 1
    finally:
        if driver:
            await driver.close_connection()
    final = result or (driver.result if driver else {})
    counts = final.get("counts", {}) if isinstance(final, dict) else {}
    print(json.dumps({
        "status": final.get("status", "FAIL"),
        "phase": args.phase,
        "caseCount": counts.get("caseCount", len(final.get("cases", []))),
        "passCount": counts.get("passCount", 0),
        "failCount": counts.get("failCount", 0),
        "sanitizedStage": final.get("sanitizedStage", "preflight"),
    }, ensure_ascii=False), flush=True)
    return exit_code


def parse_args():
    parser = argparse.ArgumentParser(description="Verify hosted DEV-133 Auth and task ownership behavior.")
    parser.add_argument("--phase", choices=("level3", "production"), required=True)
    parser.add_argument("--url", required=True, help="HTTPS origin: Level 3 preview or canonical production main origin.")
    parser.add_argument("--out", required=True, help="Output directory containing public-config.json.")
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main_async(parse_args())))
