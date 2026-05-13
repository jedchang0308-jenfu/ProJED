"""
Firebase Admin SDK bootstrap for the AI microservice.

This module is the only place in the backend that is allowed to talk to
Firebase / Firestore. Agent logic should call the helpers here instead of
initializing SDK clients on its own.
"""

from __future__ import annotations

import os
from functools import lru_cache

import firebase_admin
from firebase_admin import auth, credentials, firestore


@lru_cache(maxsize=1)
def initialize_firebase_app() -> firebase_admin.App:
    """
    Initialize Firebase Admin once per process.

    Expected production setup:
    - GOOGLE_APPLICATION_CREDENTIALS, or
    - a service account JSON path provided by the deployment environment.
    """
    if firebase_admin._apps:
        return firebase_admin.get_app()

    project_id = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCLOUD_PROJECT")
    app_options = {"projectId": project_id} if project_id else None
    service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if service_account_path:
        cred = credentials.Certificate(service_account_path)
        return firebase_admin.initialize_app(cred, app_options)

    return firebase_admin.initialize_app(options=app_options)


def get_firestore_client():
    """
    Return a Firestore client instance.

    All query/read operations for the AI assistant should go through this
    function so the database access path stays centralized and auditable.
    """
    initialize_firebase_app()
    return firestore.client()


def verify_id_token(id_token: str) -> dict:
    """
    Verify a Firebase Auth ID token and return decoded claims.
    """
    initialize_firebase_app()
    return auth.verify_id_token(id_token)


def assert_workspace_access(workspace_id: str, uid: str) -> dict:
    """
    Confirm the authenticated user belongs to the requested workspace.

    Supports the current workspace.members array and the forward-compatible
    workspaces/{workspaceId}/members/{uid} role document.
    """
    db = get_firestore_client()
    workspace_ref = db.collection("workspaces").document(workspace_id)
    workspace_doc = workspace_ref.get()

    if not workspace_doc.exists:
        raise PermissionError("Workspace not found or access denied")

    workspace = workspace_doc.to_dict() or {}
    if workspace.get("ownerId") == uid or uid in (workspace.get("members") or []):
        return {"uid": uid, "role": "admin" if workspace.get("ownerId") == uid else "user"}

    member_doc = workspace_ref.collection("members").document(uid).get()
    if member_doc.exists:
        member = member_doc.to_dict() or {}
        if member.get("status", "active") == "active":
            return {
                "uid": uid,
                "role": member.get("role", "user"),
                "status": member.get("status", "active"),
            }

    raise PermissionError("Workspace not found or access denied")
