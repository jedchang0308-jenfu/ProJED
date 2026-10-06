-- DEV-118: canonical positive-inclusion task filter query (v5).
-- Existing v4 rows remain readable and are upgraded by the client CAS path;
-- this migration only changes the default for newly-created rows.
alter table public.account_board_task_filter_preferences
  alter column preference_version set default 5;

alter table public.account_board_task_filter_preferences
  drop constraint if exists account_board_task_filter_preferences_preference_version_check;

alter table public.account_board_task_filter_preferences
  add constraint account_board_task_filter_preferences_preference_version_check
  check (preference_version > 0);
