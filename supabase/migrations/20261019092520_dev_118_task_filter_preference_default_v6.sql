-- DEV-118: new Board preference rows default to the V6 selection matrix.
-- Existing rows remain unchanged and are upgraded by the client CAS path.
alter table public.account_board_task_filter_preferences
  alter column preference_version set default 6;
