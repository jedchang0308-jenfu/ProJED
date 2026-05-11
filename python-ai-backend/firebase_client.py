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
from firebase_admin import credentials, firestore


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

    service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if service_account_path:
        cred = credentials.Certificate(service_account_path)
        return firebase_admin.initialize_app(cred)

    return firebase_admin.initialize_app()


def get_firestore_client():
    """
    Return a Firestore client instance.

    All query/read operations for the AI assistant should go through this
    function so the database access path stays centralized and auditable.
    """
    initialize_firebase_app()
    return firestore.client()
