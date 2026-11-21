-- Preserve existing audit evidence whose source never recorded a workspace.
-- Keep its NULL scope and actor instead of assigning a fabricated owner.
-- Existing forced RLS still requires a concrete authorized workspace/board;
-- no runtime policy, privilege or write path is widened by this migration.
ALTER TABLE projed_core.audit_logs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE projed_core.audit_logs
  ADD CONSTRAINT audit_logs_unscoped_project_v1
  CHECK (tenant_id IS NOT NULL OR project_id IS NULL);
