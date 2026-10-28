// Source-owned allowlist shared by the static checker and migration executor.
// Runtime still independently validates its compiled profile and exact ledger.
export const S1_MIGRATION_PATHS = Object.freeze([
  'db/migrations/0001_runtime_boundary_v1.sql',
  'db/migrations/0002_profile_actor_v1.sql',
]);

export const S3_MIGRATION_PATHS = Object.freeze([
  ...S1_MIGRATION_PATHS,
  'db/migrations/0003_domain_read_v1.sql',
  'db/migrations/0004_domain_command_v1.sql',
  'db/migrations/0005_collaboration_command_v1.sql',
  'db/migrations/0006_record_activity_v1.sql',
  'db/migrations/0007_board_transfer_v1.sql',
  'db/migrations/0008_unplaced_quick_capture_v1.sql',
  'db/migrations/0009_task_workbench_placement_v1.sql',
  'db/migrations/0010_task_tracking_reference_v1.sql',
  'db/migrations/0011_board_backup_import_v1.sql',
  'db/migrations/0012_account_preferences_v1.sql',
  'db/migrations/0013_calendar_subscriptions_v1.sql',
  'db/migrations/0014_snapshot_importer_v1.sql',
  'db/migrations/0015_llm_access_log_retention_v1.sql',
  'db/migrations/0016_workspace_lifecycle_compatibility_v1.sql',
  'db/migrations/0017_document_source_retention_v1.sql',
  'db/migrations/0018_google_identity_proof_v1.sql',
  'db/migrations/0019_app_sessions_v1.sql',
  'db/migrations/0020_snapshot_account_guards_v1.sql',
  'db/migrations/0021_safe_actor_context_v1.sql',
  'db/migrations/0022_first_login_registration_v1.sql',
  'db/migrations/0023_verified_login_email_v1.sql',
  'db/migrations/0024_rag_record_lifecycle_v1.sql',
]);
