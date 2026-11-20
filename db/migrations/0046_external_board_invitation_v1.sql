-- The inviter is set only on an invitation issued for external collaboration.
-- Legacy invitations retain their original state and do not acquire this proof.
ALTER TABLE projed_core.board_invites
  ADD COLUMN external_inviter_principal_id text
    CHECK (length(external_inviter_principal_id) BETWEEN 1 AND 255),
  ADD COLUMN external_recipient_principal_id text
    CHECK (length(external_recipient_principal_id) BETWEEN 1 AND 255),
  ADD COLUMN external_recipient_user_id uuid REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN external_access_revoked_at timestamptz,
  ADD CONSTRAINT external_invite_acceptance_v1 CHECK (
    (external_recipient_principal_id IS NULL AND external_recipient_user_id IS NULL)
    OR (status = 'accepted' AND external_inviter_principal_id IS NOT NULL
      AND external_recipient_principal_id IS NOT NULL AND external_recipient_user_id IS NOT NULL)
  );

GRANT INSERT (external_inviter_principal_id),
      UPDATE (external_recipient_principal_id, external_recipient_user_id, external_access_revoked_at)
  ON projed_core.board_invites TO projed_runtime_disposable;
