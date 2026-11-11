-- Purpose-specific role for the one-time full snapshot import into an empty
-- candidate database. The role is provisioned by foundation/release tooling;
-- this app migration only grants the minimum data-plane surface.
GRANT USAGE ON SCHEMA projed_core TO projed_importer_disposable;
GRANT SELECT ON projed_core.schema_migrations, projed_core.runtime_metadata
  TO projed_importer_disposable;

GRANT SELECT, INSERT ON
  projed_core.profiles,
  projed_core.tenants,
  projed_core.projects,
  projed_core.actor_scope_access,
  projed_core.tenant_members,
  projed_core.project_members,
  projed_core.board_role_permissions,
  projed_core.resource_revisions,
  projed_core.task_tags,
  projed_core.wbs_items,
  projed_core.wbs_item_tags,
  projed_core.wbs_dependencies,
  projed_core.board_invites,
  projed_core.knowledge_records,
  projed_core.record_task_links,
  projed_core.activity_events,
  projed_core.audit_logs,
  projed_core.unplaced_tasks,
  projed_core.quick_task_capture_receipts,
  projed_core.task_workbench_placement_operations,
  projed_core.task_tracking_references,
  projed_core.task_tracking_reference_operations,
  projed_core.backup_import_executions,
  projed_core.account_board_task_filter_preferences,
  projed_core.calendar_subscriptions
TO projed_importer_disposable;

CREATE POLICY snapshot_importer_v1 ON projed_core.profiles
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.tenants
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.projects
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.actor_scope_access
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.tenant_members
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.project_members
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.board_role_permissions
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.resource_revisions
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.task_tags
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.wbs_items
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.wbs_item_tags
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.wbs_dependencies
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.board_invites
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.knowledge_records
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.record_task_links
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.activity_events
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.audit_logs
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.unplaced_tasks
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.quick_task_capture_receipts
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.task_workbench_placement_operations
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.task_tracking_references
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.task_tracking_reference_operations
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.backup_import_executions
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.account_board_task_filter_preferences
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.calendar_subscriptions
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
